from datetime import datetime, timezone
from decimal import Decimal

from titan_sync.fields import field_map, skipped_field_ids
from titan_sync.transform import record_to_row


def test_record_to_row_maps_by_field_id(ids, source):
    rec = source.make(
        "rec1", sku="ENG-VIDR-0042", product_name="Vidar Macaroon", supplier="VIDAR", category="Engineered hardwood",
        width_in=7.5, cost=4.79, retail_price=5.79, active=True, waterproof=False, certifications=["Floorscore;CARB II"],
        effective_date="2026-09-01", tone_depth=2, style=["Modern", "Coastal"],
        swatch_images=[{"id": "attA", "url": "http://x/a", "filename": "a.jpg", "type": "image/jpeg", "size": 1},
                       {"id": "attB", "url": "http://x/b", "filename": "b.jpg", "type": "image/jpeg", "size": 1}],
        detail_images=[{"id": "attC", "url": "http://x/c", "filename": "c.png", "type": "image/png", "size": 1}],
    )
    rec.pop("_modified")
    now = datetime(2026, 9, 26, tzinfo=timezone.utc)
    conv = record_to_row(rec, field_map(ids), skip_ids=skipped_field_ids(ids), fallback_modified=now)
    row = conv.row
    assert row["airtable_record_id"] == "rec1"
    assert row["airtable_modified_at"] == now  # no Last modified field yet → sync time
    assert row["sku"] == "ENG-VIDR-0042"
    assert row["last_price_update"].isoformat() == "2026-09-01"
    assert row["width_in"] == Decimal("7.50") and row["cost"] == Decimal("4.79")
    assert row["active"] is True and row["waterproof"] is False and row["pet_friendly"] is False
    assert row["certifications"] == ["Floorscore", "CARB II"]
    assert row["tone_depth"] == 2 and row["style"] == ["Modern", "Coastal"]
    assert [a["kind"] + ":" + a["id"] + ":" + str(a["sort"]) for a in row["image_attachments"]] == ["swatch:attA:0", "swatch:attB:1", "detail:attC:0"]
    assert conv.issues == [] and conv.unknown_field_ids == set()
    assert row["lightspeed_id"] is None and row["image_attachments"][0]["url"] == "http://x/a"


def test_junk_options_and_unknown_fields_are_reported(ids, source):
    rec = source.make("rec2", sku="X-1", category="Category", suitable_rooms=["Kitchen", "Suitable rooms"])
    rec["fields"]["fldUNKNOWN0000001"] = "new field"
    rec.pop("_modified")
    conv = record_to_row(rec, field_map(ids), skip_ids=skipped_field_ids(ids), fallback_modified=datetime.now(timezone.utc))
    assert conv.row["category"] is None
    assert conv.row["suitable_rooms"] == ["Kitchen"]
    kinds = sorted(i.kind for i in conv.issues)
    assert kinds == ["bad_multiselect", "bad_select"]
    assert conv.unknown_field_ids == {"fldUNKNOWN0000001"}


def test_skipped_fields_are_not_unknown(ids, source):
    rec = source.make("rec3", sku="X-2", attachments=[{"id": "att9", "url": "u"}], internal_notes="n")
    rec.pop("_modified")
    conv = record_to_row(rec, field_map(ids), skip_ids=skipped_field_ids(ids), fallback_modified=datetime.now(timezone.utc))
    assert conv.unknown_field_ids == set()
    assert conv.row["internal_notes"] == "n"
    assert conv.row["image_attachments"] == []
