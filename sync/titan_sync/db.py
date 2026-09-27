"""Postgres side of the sync: runs, issues, watermark, stage + merge, deletion guard."""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Iterable

import psycopg
from psycopg.types.json import Jsonb

from .fields import CATALOGUE_COLUMNS

_JSONB_COLUMNS = {"image_attachments"}


@dataclass
class MergeResult:
    staged: int = 0
    excluded: int = 0
    inserted: int = 0
    updated: int = 0


class Db:
    def __init__(self, dsn: str):
        self.conn = psycopg.connect(dsn, autocommit=False)

    # ---- runs & issues -------------------------------------------------------------
    def start_run(self, mode: str, *, trigger: str | None, github_run_id: str | None, watermark_before: datetime | None) -> int:
        with self.conn.cursor() as cur:
            cur.execute(
                "insert into mirror.sync_runs (mode, trigger, github_run_id, watermark_before) values (%s, %s, %s, %s) returning id",
                (mode, trigger, github_run_id, watermark_before),
            )
            run_id = cur.fetchone()[0]
        self.conn.commit()
        return run_id

    def finish_run(self, run_id: int, status: str, **counts: Any) -> None:
        cols = ", ".join(f"{k} = %s" for k in counts)
        with self.conn.cursor() as cur:
            cur.execute(
                f"update mirror.sync_runs set finished_at = now(), status = %s{', ' + cols if cols else ''} where id = %s",
                (status, *counts.values(), run_id),
            )
        self.conn.commit()

    def add_issue(self, run_id: int | None, kind: str, message: str, *, record_id: str | None = None,
                  sku: str | None = None, field: str | None = None) -> None:
        with self.conn.cursor() as cur:
            cur.execute(
                "insert into mirror.sync_issues (run_id, airtable_record_id, sku, field, kind, message) values (%s, %s, %s, %s, %s, %s)",
                (run_id, record_id, sku, field, kind, message[:2000]),
            )

    def issue_count(self, run_id: int) -> int:
        with self.conn.cursor() as cur:
            cur.execute("select count(*) from mirror.sync_issues where run_id = %s", (run_id,))
            return cur.fetchone()[0]

    # ---- watermark ----------------------------------------------------------------------
    def get_state(self, key: str) -> str | None:
        with self.conn.cursor() as cur:
            cur.execute("select value from mirror.sync_state where key = %s", (key,))
            row = cur.fetchone()
            return row[0] if row else None

    def set_state(self, key: str, value: str) -> None:
        with self.conn.cursor() as cur:
            cur.execute(
                "insert into mirror.sync_state (key, value) values (%s, %s) on conflict (key) do update set value = excluded.value, updated_at = now()",
                (key, value),
            )

    def get_watermark(self) -> datetime | None:
        v = self.get_state("watermark")
        return datetime.fromisoformat(v) if v else None

    def set_watermark(self, when: datetime) -> None:
        self.set_state("watermark", when.astimezone(timezone.utc).isoformat())

    # ---- stage + merge --------------------------------------------------------------------
    def stage_rows(self, rows: Iterable[dict[str, Any]]) -> int:
        """TRUNCATE the stage and COPY rows in (explicit column list)."""
        n = 0
        with self.conn.cursor() as cur:
            cur.execute("truncate mirror.catalogue_stage")
            cols = ", ".join(CATALOGUE_COLUMNS)
            with cur.copy(f"copy mirror.catalogue_stage ({cols}) from stdin") as copy:
                for row in rows:
                    values = []
                    for c in CATALOGUE_COLUMNS:
                        v = row.get(c)
                        if c in _JSONB_COLUMNS:
                            v = json.dumps(v if v is not None else [])
                        values.append(v)
                    copy.write_row(values)
                    n += 1
        return n

    def validate_stage(self, run_id: int) -> int:
        """Exclude rows that cannot be merged; log each as an issue. Returns the number excluded."""
        excluded = 0
        with self.conn.cursor() as cur:
            # blank SKU (coercion already flagged it; here we enforce)
            cur.execute("delete from mirror.catalogue_stage where sku is null or btrim(sku) = '' returning airtable_record_id")
            for (rid,) in cur.fetchall():
                self.add_issue(run_id, "blank_sku", "record has no SKU; skipped", record_id=rid)
                excluded += 1
            # duplicate SKU within the batch: keep the most recently modified
            cur.execute(
                """
                delete from mirror.catalogue_stage s
                 using (select airtable_record_id, sku,
                               row_number() over (partition by sku order by airtable_modified_at desc, airtable_record_id) as rn
                          from mirror.catalogue_stage) d
                 where d.airtable_record_id = s.airtable_record_id and d.rn > 1
                 returning s.airtable_record_id, s.sku
                """
            )
            for rid, sku in cur.fetchall():
                self.add_issue(run_id, "duplicate_sku", f"SKU {sku} appears on more than one record in this batch; skipped", record_id=rid, sku=sku)
                excluded += 1
            # SKU already owned by a different record in the mirror
            cur.execute(
                """
                delete from mirror.catalogue_stage s
                 using mirror.catalogue c
                 where c.sku = s.sku and c.airtable_record_id <> s.airtable_record_id
                 returning s.airtable_record_id, s.sku, c.airtable_record_id
                """
            )
            for rid, sku, owner in cur.fetchall():
                self.add_issue(run_id, "duplicate_sku", f"SKU {sku} already belongs to record {owner}; skipped", record_id=rid, sku=sku)
                excluded += 1
        return excluded

    def merge_stage(self) -> tuple[int, int]:
        """INSERT … ON CONFLICT with an explicit column list; returns (inserted, updated)."""
        cols = ", ".join(CATALOGUE_COLUMNS)
        sets = ", ".join(f"{c} = excluded.{c}" for c in CATALOGUE_COLUMNS if c != "airtable_record_id")
        with self.conn.cursor() as cur:
            cur.execute(
                f"""
                insert into mirror.catalogue ({cols}, synced_at)
                select {cols}, now() from mirror.catalogue_stage
                on conflict (airtable_record_id) do update
                   set {sets}, synced_at = now()
                 where excluded.airtable_modified_at >= mirror.catalogue.airtable_modified_at
                returning (xmax = 0) as inserted
                """
            )
            flags = [r[0] for r in cur.fetchall()]
        return sum(1 for f in flags if f), sum(1 for f in flags if not f)

    def stage_and_merge(self, run_id: int, rows: Iterable[dict[str, Any]]) -> MergeResult:
        res = MergeResult()
        res.staged = self.stage_rows(rows)
        res.excluded = self.validate_stage(run_id)
        res.inserted, res.updated = self.merge_stage()
        return res

    # ---- deletes (full mode only) --------------------------------------------------------
    def catalogue_count(self) -> int:
        with self.conn.cursor() as cur:
            cur.execute("select count(*) from mirror.catalogue")
            return cur.fetchone()[0]

    def delete_missing(self, present_ids: Iterable[str]) -> int:
        """Delete catalogue rows whose record id is not in `present_ids`; soft-delete their images first."""
        with self.conn.cursor() as cur:
            cur.execute("create temp table if not exists present_ids (id text primary key) on commit drop")
            cur.execute("truncate present_ids")
            with cur.copy("copy present_ids (id) from stdin") as copy:
                for rid in present_ids:
                    copy.write_row([rid])
            cur.execute(
                """
                update mirror.catalogue_images i
                   set deleted_at = coalesce(i.deleted_at, now())
                  from mirror.catalogue c
                 where i.airtable_record_id = c.airtable_record_id
                   and not exists (select 1 from present_ids p where p.id = c.airtable_record_id)
                """
            )
            cur.execute("delete from mirror.catalogue c where not exists (select 1 from present_ids p where p.id = c.airtable_record_id)")
            return cur.rowcount

    def commit(self) -> None:
        self.conn.commit()

    def rollback(self) -> None:
        self.conn.rollback()

    def close(self) -> None:
        self.conn.close()

    # ---- helpers used by the image job ------------------------------------------------------------
    def jsonb(self, value: Any) -> Jsonb:
        return Jsonb(value)
