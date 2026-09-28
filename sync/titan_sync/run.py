"""Entry point: python -m titan_sync.run --mode incremental | full | images | purge | report"""

from __future__ import annotations

import argparse
import sys
import traceback
from datetime import datetime, timedelta, timezone
from typing import Any

import structlog

from .airtable import AirtableSource, Source
from .config import Settings
from .db import Db, MergeResult
from .design import sync_design_tables
from .fields import field_map, skipped_field_ids
from .images import ImageSync
from .storage import SupabaseStorage
from .transform import record_to_row

log = structlog.get_logger("titan_sync")


class GuardTripped(RuntimeError):
    pass


def _now() -> datetime:
    return datetime.now(timezone.utc)


def sync_catalogue(db: Db, source: Source, settings: Settings, *, mode: str) -> dict[str, Any]:
    """Shared body of incremental and full runs. Returns the counts written to sync_runs."""
    fmap = field_map(settings.ids)
    skip_ids = skipped_field_ids(settings.ids)
    watermark = db.get_watermark() if mode == "incremental" else None
    since = (watermark - timedelta(minutes=settings.watermark_overlap_minutes)) if watermark else None
    started = _now()
    run_id = db.start_run(mode, trigger=settings.trigger, github_run_id=settings.github_run_id, watermark_before=watermark)
    log.info("run.start", run_id=run_id, mode=mode, since=since.isoformat() if since else None)

    rows: list[dict[str, Any]] = []
    unknown: set[str] = set()
    issues = 0
    try:
        for page in source.iter_pages(since):
            for record in page:
                conv = record_to_row(record, fmap, skip_ids=skip_ids, fallback_modified=started)
                unknown |= conv.unknown_field_ids
                for iss in conv.issues:
                    db.add_issue(run_id, iss.kind, iss.message, record_id=conv.record_id, sku=conv.sku, field=iss.field)
                    issues += 1
                rows.append(conv.row)
        fetched = len(rows)
        for fid in sorted(unknown):
            db.add_issue(run_id, "unmapped_field", f"Airtable field {fid} is not mapped or skipped; run schema_snapshot --check")
            issues += 1

        deleted = 0
        if mode == "full":
            current = db.catalogue_count()
            too_few = fetched < settings.deletion_guard_min_rows or fetched < settings.deletion_guard_ratio * current
            if current and too_few:
                db.rollback()
                db.finish_run(run_id, "guard_tripped", fetched=fetched, api_calls=source.api_calls,
                              error=f"fetched {fetched} rows but the mirror holds {current}; deletes skipped")
                raise GuardTripped(f"deletion guard tripped: fetched {fetched}, mirror has {current}")

        res: MergeResult = db.stage_and_merge(run_id, rows)
        if mode == "full":
            deleted = db.delete_missing(r["airtable_record_id"] for r in rows)
        db.set_watermark(started)
        db.commit()
        counts = dict(fetched=fetched, inserted=res.inserted, updated=res.updated, deleted=deleted,
                      issues=issues + res.excluded, api_calls=source.api_calls, watermark_after=started)
        # The two small design tables ride along on every catalogue run. A failure there is
        # logged and reported, never allowed to fail (or roll back) the catalogue sync.
        try:
            design = sync_design_tables(db, source, settings.ids, run_id)
            counts["design"] = design
        except Exception as e:
            db.rollback()
            db.add_issue(run_id, "design_tables_failed", f"{type(e).__name__}: {e}"[:2000])
            db.commit()
            log.error("design.failed", run_id=run_id, error=str(e))
        db.finish_run(run_id, "success", **{k: v for k, v in counts.items() if k != "design"})
        log.info("run.done", run_id=run_id, **{k: (v.isoformat() if isinstance(v, datetime) else v) for k, v in counts.items()})
        return counts
    except GuardTripped:
        raise
    except Exception as e:
        db.rollback()
        db.finish_run(run_id, "failed", fetched=len(rows), api_calls=source.api_calls, error=f"{type(e).__name__}: {e}"[:2000])
        raise


def run_images(db: Db, settings: Settings, source: Source | None, *, batch: int) -> dict[str, Any]:
    storage = SupabaseStorage(settings.supabase_url, settings.service_role_key)
    run_id = db.start_run("images", trigger=settings.trigger, github_run_id=settings.github_run_id, watermark_before=None)
    job = ImageSync(db=db, storage=storage, source=source, public_base_url=settings.public_base_url, run_id=run_id)
    try:
        c = job.run(batch)
        counts = dict(images_processed=c.processed + c.reused + c.undeleted, images_skipped=c.skipped + c.failed,
                      issues=db.issue_count(run_id), api_calls=(source.api_calls if source else 0))
        db.finish_run(run_id, "success", **counts)
        log.info("images.done", run_id=run_id, **c.__dict__)
        return counts
    except Exception as e:
        db.rollback()
        db.finish_run(run_id, "failed", error=f"{type(e).__name__}: {e}"[:2000])
        raise


def run_purge(db: Db, settings: Settings) -> int:
    storage = SupabaseStorage(settings.supabase_url, settings.service_role_key)
    run_id = db.start_run("purge", trigger=settings.trigger, github_run_id=settings.github_run_id, watermark_before=None)
    job = ImageSync(db=db, storage=storage, source=None, public_base_url=settings.public_base_url, run_id=run_id)
    try:
        n = job.purge(settings.purge_days)
        db.finish_run(run_id, "success", images_processed=n)
        log.info("purge.done", run_id=run_id, purged=n)
        return n
    except Exception as e:
        db.rollback()
        db.finish_run(run_id, "failed", error=f"{type(e).__name__}: {e}"[:2000])
        raise


def report(db: Db, *, since_run: bool) -> str:
    """Markdown summary of the latest run(s) and their issues, for $GITHUB_STEP_SUMMARY."""
    with db.conn.cursor() as cur:
        cur.execute(
            "select id, mode, status, started_at, finished_at, fetched, inserted, updated, deleted, images_processed, images_skipped, issues, api_calls, error "
            "from mirror.sync_runs order by started_at desc limit %s",
            (1 if since_run else 5,),
        )
        runs = cur.fetchall()
        lines = ["## titan-sync report", "", "| run | mode | status | fetched | ins | upd | del | imgs | skipped | issues | api calls |", "|---|---|---|---|---|---|---|---|---|---|---|"]
        for r in runs:
            lines.append(f"| {r[0]} | {r[1]} | {r[2]} | {r[5] or 0} | {r[6] or 0} | {r[7] or 0} | {r[8] or 0} | {r[9] or 0} | {r[10] or 0} | {r[11] or 0} | {r[12] or 0} |")
            if r[13]:
                lines.append(f"\n**error (run {r[0]}):** `{r[13]}`\n")
        if runs:
            cur.execute("select kind, count(*) from mirror.sync_issues where run_id = %s group by kind order by 2 desc", (runs[0][0],))
            kinds = cur.fetchall()
            if kinds:
                lines += ["", f"### Issues in run {runs[0][0]}", ""]
                lines += [f"- **{k}**: {n}" for k, n in kinds]
                cur.execute("select kind, sku, field, message from mirror.sync_issues where run_id = %s order by id limit 50", (runs[0][0],))
                lines += ["", "| kind | sku | field | message |", "|---|---|---|---|"]
                lines += [f"| {k} | {s or ''} | {f or ''} | {m.replace('|', '/')} |" for k, s, f, m in cur.fetchall()]
        cur.execute("select sku, kind, filename, reason from mirror.catalogue_image_skips order by last_seen desc limit 100")
        skips = cur.fetchall()
        if skips:
            lines += ["", f"### Skipped image files ({len(skips)} shown)", "", "| sku | field | file | reason |", "|---|---|---|---|"]
            lines += [f"| {s} | {k} | {f or ''} | {r.replace('|', '/')} |" for s, k, f, r in skips]
    return "\n".join(lines) + "\n"


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="titan-sync")
    ap.add_argument("--mode", required=True, choices=["incremental", "full", "images", "purge", "report"])
    ap.add_argument("--batch", type=int, default=None, help="images per --mode images run (default SYNC_IMAGE_BATCH)")
    ap.add_argument("--since-run", action="store_true", help="report: only the latest run")
    args = ap.parse_args(argv)

    structlog.configure(processors=[structlog.processors.TimeStamper(fmt="iso"), structlog.processors.KeyValueRenderer(key_order=["event"])])
    settings = Settings.from_env()
    settings.require("database_url")
    db = Db(settings.database_url)
    try:
        if args.mode in ("incremental", "full"):
            settings.require("airtable_token")
            source = AirtableSource(settings.airtable_token, settings.ids)
            sync_catalogue(db, source, settings, mode=args.mode)
        elif args.mode == "images":
            settings.require("supabase_url", "service_role_key")
            source = AirtableSource(settings.airtable_token, settings.ids) if settings.airtable_token else None
            run_images(db, settings, source, batch=args.batch or settings.image_batch)
        elif args.mode == "purge":
            settings.require("supabase_url", "service_role_key")
            run_purge(db, settings)
        elif args.mode == "report":
            sys.stdout.write(report(db, since_run=args.since_run))
        return 0
    except GuardTripped as e:
        log.error("run.guard_tripped", error=str(e))
        return 2
    except Exception:
        traceback.print_exc()
        return 1
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
