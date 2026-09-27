"""Compare the live Airtable table schema with sync/schema_snapshot.json.

    python -m titan_sync.schema_snapshot --check   # exit 1 and print a diff on drift
    python -m titan_sync.schema_snapshot --write   # refresh the snapshot from the live base
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import date
from pathlib import Path

from .airtable import AirtableSource
from .config import Settings

SNAPSHOT = Path(__file__).resolve().parents[1] / "schema_snapshot.json"


def load_snapshot(path: Path = SNAPSHOT) -> dict:
    return json.loads(path.read_text())


def diff(snapshot: list[dict], live: list[dict]) -> list[str]:
    snap = {f["id"]: f for f in snapshot}
    now = {f["id"]: f for f in live}
    lines: list[str] = []
    for fid, f in now.items():
        if fid not in snap:
            lines.append(f"+ new field    {fid}  {f['name']!r} ({f['type']})")
        elif (snap[fid]["name"], snap[fid]["type"]) != (f["name"], f["type"]):
            lines.append(f"~ changed      {fid}  {snap[fid]['name']!r} ({snap[fid]['type']}) -> {f['name']!r} ({f['type']})")
    for fid, f in snap.items():
        if fid not in now:
            lines.append(f"- removed      {fid}  {f['name']!r} ({f['type']})")
    return lines


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--check", action="store_true")
    g.add_argument("--write", action="store_true")
    args = ap.parse_args(argv)

    settings = Settings.from_env()
    settings.require("airtable_token")
    src = AirtableSource(settings.airtable_token, settings.ids)
    live = src.table_schema()

    if args.write:
        SNAPSHOT.write_text(json.dumps({
            "base_id": settings.ids.base_id,
            "table_id": settings.ids.catalogue_table_id,
            "table_name": "Master Flooring Catalogue",
            "captured_at": date.today().isoformat(),
            "fields": live,
        }, indent=2) + "\n")
        print(f"wrote {SNAPSHOT} ({len(live)} fields)")
        return 0

    lines = diff(load_snapshot()["fields"], live)
    if not lines:
        print("schema unchanged")
        return 0
    print("Airtable schema drift detected:")
    print("\n".join(lines))
    return 1


if __name__ == "__main__":
    sys.exit(main())
