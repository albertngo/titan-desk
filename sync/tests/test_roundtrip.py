"""Full → incremental → delete → guard, against a real database with migration 001 applied."""

from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest

from titan_sync.run import GuardTripped, sync_catalogue

from .conftest import needs_db

pytestmark = needs_db


def _q(db, sql, *args):
    with db.conn.cursor() as cur:
        cur.execute(sql, args)
        return cur.fetchall()


def _seed(source, n=6):
    base = datetime(2026, 9, 1, tzinfo=timezone.utc)
    for i in range(n):
        source.add(f"rec{i}", modified=base + timedelta(hours=i), sku=f"T-SKU-{i:03d}", product_name=f"Product {i}",
                   supplier="VIDAR", category="LVP", cost=1 + i, retail_price=2 + i, active=True, waterproof=(i % 2 == 0),
                   swatch_images=[{"id": f"att{i}", "url": f"http://img/{i}", "filename": f"{i}.jpg", "type": "image/jpeg", "size": 1}])


def test_full_then_incremental_then_delete(db, reader, source, settings):
    _seed(source)
    counts = sync_catalogue(db, source, settings, mode="full")
    assert counts["fetched"] == 6 and counts["inserted"] == 6 and counts["updated"] == 0 and counts["deleted"] == 0
    rows = _q(db, "select sku, product_name, cost, waterproof, image_attachments from mirror.catalogue order by sku")
    assert len(rows) == 6
    assert rows[0][0] == "T-SKU-000" and rows[0][2] == Decimal("1.00") and rows[0][3] is True
    assert rows[0][4][0]["id"] == "att0"
    assert reader.execute("select count(*) from api.catalogue_public").fetchone()[0] == 6
    assert db.get_watermark() is not None
    run = _q(db, "select mode, status, fetched, inserted from mirror.sync_runs order by id desc limit 1")[0]
    assert run == ("full", "success", 6, 6)

    # incremental: only the changed record is fetched and merged
    source.add("rec2", modified=datetime.now(timezone.utc) + timedelta(seconds=1), sku="T-SKU-002", product_name="Product 2 renamed",
               supplier="VIDAR", category="LVP", cost=99, retail_price=100, active=True)
    counts = sync_catalogue(db, source, settings, mode="incremental")
    assert counts["fetched"] == 1 and counts["updated"] == 1 and counts["inserted"] == 0
    assert _q(db, "select product_name, cost from mirror.catalogue where sku = 'T-SKU-002'")[0] == ("Product 2 renamed", Decimal("99.00"))
    assert _q(db, "select count(*) from mirror.catalogue")[0][0] == 6  # incremental never deletes

    # an older copy of a record never overwrites a newer row
    old = source.make("rec2", modified=datetime(2020, 1, 1, tzinfo=timezone.utc), sku="T-SKU-002", product_name="STALE")
    old.pop("_modified")
    from titan_sync.fields import field_map, skipped_field_ids
    from titan_sync.transform import record_to_row
    conv = record_to_row(old, field_map(settings.ids), skip_ids=skipped_field_ids(settings.ids),
                         fallback_modified=datetime(2020, 1, 1, tzinfo=timezone.utc))
    run_id = db.start_run("incremental", trigger="test", github_run_id=None, watermark_before=None)
    res = db.stage_and_merge(run_id, [conv.row])
    db.commit()
    assert res.updated == 0 and res.inserted == 0
    assert _q(db, "select product_name from mirror.catalogue where sku = 'T-SKU-002'")[0][0] == "Product 2 renamed"

    # full run with a record gone from Airtable → deleted, its image rows soft-deleted first
    db.conn.execute("""insert into mirror.catalogue_images (airtable_record_id, sku, kind, airtable_attachment_id, source_hash, original_path, original_mime,
              original_bytes, public_base_url) values ('rec5', 'T-SKU-005', 'swatch', 'att5', 'h', 'p', 'image/jpeg', 1, 'b')""")
    db.commit()
    source.records = [r for r in source.records if r["id"] != "rec5"]
    counts = sync_catalogue(db, source, settings, mode="full")
    assert counts["deleted"] == 1
    assert _q(db, "select count(*) from mirror.catalogue where sku = 'T-SKU-005'")[0][0] == 0
    assert _q(db, "select deleted_at is not null from mirror.catalogue_images where airtable_record_id = 'rec5'")[0][0] is True


def test_duplicate_sku_is_excluded_and_reported(db, source, settings):
    _seed(source, 3)
    source.add("recDUP", sku="T-SKU-001", product_name="dup", active=True)
    counts = sync_catalogue(db, source, settings, mode="full")
    assert counts["fetched"] == 4 and counts["inserted"] == 3
    issues = _q(db, "select kind, sku from mirror.sync_issues order by id")
    assert ("duplicate_sku", "T-SKU-001") in issues
    assert _q(db, "select count(*) from mirror.catalogue")[0][0] == 3

    # next run: the duplicate still exists in Airtable but the SKU belongs to another record
    counts = sync_catalogue(db, source, settings, mode="full")
    assert _q(db, "select count(*) from mirror.catalogue")[0][0] == 3
    assert counts["issues"] >= 1


def test_blank_sku_and_junk_select_are_issues_not_failures(db, source, settings):
    source.add("recA", sku="T-OK", category="Category", active=True)
    source.add("recB", sku="   ", product_name="no sku")
    counts = sync_catalogue(db, source, settings, mode="full")
    assert counts["inserted"] == 1
    kinds = sorted(k for (k,) in _q(db, "select kind from mirror.sync_issues"))
    assert kinds == ["bad_select", "bad_sku", "blank_sku"]


def test_deletion_guard_trips_on_a_short_fetch(db, source, settings):
    _seed(source, 6)
    sync_catalogue(db, source, settings, mode="full")
    source.records = source.records[:2]  # 33% of the mirror → guard
    with pytest.raises(GuardTripped):
        sync_catalogue(db, source, settings, mode="full")
    assert _q(db, "select count(*) from mirror.catalogue")[0][0] == 6
    assert _q(db, "select status from mirror.sync_runs order by id desc limit 1")[0][0] == "guard_tripped"


def test_first_incremental_without_watermark_fetches_everything(db, source, settings):
    _seed(source, 4)
    counts = sync_catalogue(db, source, settings, mode="incremental")
    assert counts["fetched"] == 4
