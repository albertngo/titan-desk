"""Every Airtable field in the snapshot is mapped or explicitly skipped, and every mapped id exists."""

import json
from pathlib import Path

from titan_sync.fields import CATALOGUE_COLUMNS, SKIP, SPECS, field_map, skipped_field_ids

SNAPSHOT = Path(__file__).resolve().parents[1] / "schema_snapshot.json"


def test_every_snapshot_field_is_mapped_or_skipped(ids):
    snap = json.loads(SNAPSHOT.read_text())["fields"]
    fmap = field_map(ids)
    skip = skipped_field_ids(ids)
    unhandled = [f["name"] for f in snap if f["id"] not in fmap and f["id"] not in skip]
    assert unhandled == [], f"decide a tier for: {unhandled}"


def test_every_mapped_id_exists_in_snapshot(ids):
    snap = {f["id"] for f in json.loads(SNAPSHOT.read_text())["fields"]}
    for spec in SPECS:
        fid = ids.fields.get(spec.key)
        if spec.key == "last_modified":
            continue  # created later in Airtable; None until then
        assert fid, f"{spec.key} has no field id in platform-settings/airtable.json"
        assert fid in snap, f"{spec.key} → {fid} is not in the schema snapshot"


def test_skip_keys_have_ids(ids):
    for key in SKIP:
        assert ids.fields.get(key), key


def test_columns_are_unique_and_include_system_columns():
    assert len(CATALOGUE_COLUMNS) == len(set(CATALOGUE_COLUMNS))
    for c in ("airtable_record_id", "airtable_modified_at", "sku", "image_attachments", "last_price_update"):
        assert c in CATALOGUE_COLUMNS


def test_kinds_are_known():
    from titan_sync.coerce import COERCERS
    for spec in SPECS:
        assert spec.kind in COERCERS, spec.key
