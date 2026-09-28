"""Design Dictionary + Design Rules: copied whole from Airtable on every sync run.

Both tables are small (tens of rows) and edited by hand in Airtable, so there is no
watermark: each run reads them in full (one API page each) and replaces the mirror copy in
one transaction. A row missing a required cell is skipped and logged as a sync issue, never
guessed. Guard: a fetch that returns nothing never wipes a table that has rows (an empty
read is far more likely an outage than Albert deleting every row).
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Callable

from . import coerce
from .config import AirtableIds

_MATCH_SPLIT = re.compile(r"\s*[;\n]\s*")


@dataclass
class TableResult:
    rows: list[dict[str, Any]] = field(default_factory=list)
    issues: list[tuple[str | None, str, str]] = field(default_factory=list)  # (record id, kind, message)


def _cell(rec: dict[str, Any], fid: str | None) -> Any:
    return (rec.get("fields") or {}).get(fid) if fid else None


def _matches(value: Any) -> list[str]:
    text, _ = coerce.text(value)
    if not text:
        return []
    out: list[str] = []
    for part in _MATCH_SPLIT.split(text.lower()):
        part = " ".join(part.split())
        if part and part not in out:
            out.append(part)
    return out


def _num(value: Any) -> Any:
    return coerce.number(value, scale=2)[0]


def _int_1_5(value: Any) -> int | None:
    n, _ = coerce.rating(value)
    return n


def _sel(value: Any) -> str | None:
    return coerce.single_select(value)[0]


def _multi(value: Any) -> list[str]:
    return coerce.multi_select(value)[0]


def _text(value: Any) -> str | None:
    return coerce.text(value)[0]


DICTIONARY_COLUMNS: list[tuple[str, Callable[[Any], Any]]] = [
    ("phrase", _text), ("matches", _matches), ("kind", _sel), ("undertone", _multi),
    ("tone_depth_min", _int_1_5), ("tone_depth_max", _int_1_5), ("busyness", _multi), ("texture", _multi),
    ("style", _multi), ("width_min_in", _num), ("width_max_in", _num), ("weight", _num),
    ("also_look_for", _text), ("also_avoid", _text), ("say_to_client", _text), ("notes", _text),
    ("active", lambda v: coerce.checkbox(v)[0]),
]

RULE_COLUMNS: list[tuple[str, Callable[[Any], Any]]] = [
    ("rule", _text), ("key", _text), ("kind", _sel), ("rule_when", _sel), ("effect", _sel), ("field", _sel),
    ("rule_values", _text), ("weight", _num), ("say_to_client", _text), ("notes", _text),
    ("active", lambda v: coerce.checkbox(v)[0]),
]


def dictionary_rows(records: list[dict[str, Any]], fids: dict[str, str]) -> TableResult:
    res = TableResult()
    for rec in records:
        row = {"airtable_record_id": rec["id"]}
        for col, conv in DICTIONARY_COLUMNS:
            row[col] = conv(_cell(rec, fids.get(col)))
        if row["weight"] is None:
            row["weight"] = 1
        if not row["phrase"] or row["kind"] not in ("Preference", "Avoid"):
            res.issues.append((rec["id"], "design_row_skipped",
                               f"Design Dictionary row {row['phrase'] or rec['id']!r} needs a Phrase and a Kind; skipped"))
            continue
        for lo, hi in (("tone_depth_min", "tone_depth_max"), ("width_min_in", "width_max_in")):
            if row[lo] is not None and row[hi] is not None and row[lo] > row[hi]:
                res.issues.append((rec["id"], "design_row_fixed", f"{row['phrase']}: {lo} > {hi}; swapped"))
                row[lo], row[hi] = row[hi], row[lo]
        res.rows.append(row)
    return res


def rule_rows(records: list[dict[str, Any]], fids: dict[str, str]) -> TableResult:
    res = TableResult()
    seen: set[str] = set()
    for rec in records:
        row = {"airtable_record_id": rec["id"]}
        for col, conv in RULE_COLUMNS:
            row[col] = conv(_cell(rec, fids.get(col)))
        missing = [c for c in ("rule", "key", "kind", "rule_when", "effect") if not row[c]]
        if missing:
            res.issues.append((rec["id"], "design_row_skipped",
                               f"Design Rules row {row['rule'] or rec['id']!r} is missing {', '.join(missing)}; skipped"))
            continue
        if row["key"] in seen:
            res.issues.append((rec["id"], "design_row_skipped", f"Design Rules key {row['key']!r} is used twice; second row skipped"))
            continue
        seen.add(row["key"])
        res.rows.append(row)
    return res


def _replace(cur: Any, table: str, columns: list[str], rows: list[dict[str, Any]]) -> None:
    cur.execute(f"delete from mirror.{table}")
    if not rows:
        return
    cols = ", ".join(["airtable_record_id", *columns])
    marks = ", ".join(["%s"] * (len(columns) + 1))
    cur.executemany(f"insert into mirror.{table} ({cols}) values ({marks})",
                    [[r["airtable_record_id"], *(r[c] for c in columns)] for r in rows])


def sync_design_tables(db: Any, source: Any, ids: AirtableIds, run_id: int | None) -> dict[str, int]:
    """Fetch both tables and replace their mirror copies (one transaction). Returns row counts.
    Raises only on a database error; a missing table id means the table is simply not synced."""
    counts: dict[str, int] = {}
    plan = [
        ("design_dictionary", ids.design_dictionary_table_id, ids.design_dictionary_fields, dictionary_rows,
         [c for c, _ in DICTIONARY_COLUMNS]),
        ("design_rules", ids.design_rules_table_id, ids.design_rules_fields, rule_rows,
         [c for c, _ in RULE_COLUMNS]),
    ]
    with db.conn.cursor() as cur:
        for table, table_id, fids, build, columns in plan:
            if not table_id or not fids:
                continue
            records = source.table_records(table_id)
            res = build(records, fids)
            for rid, kind, msg in res.issues:
                db.add_issue(run_id, kind, msg, record_id=rid)
            cur.execute(f"select count(*) from mirror.{table}")
            current = cur.fetchone()[0]
            if not records and current:
                db.add_issue(run_id, "design_guard", f"{table}: Airtable returned no rows but the mirror has {current}; kept the mirror")
                counts[table] = current
                continue
            _replace(cur, table, columns, res.rows)
            counts[table] = len(res.rows)
    db.commit()
    return counts
