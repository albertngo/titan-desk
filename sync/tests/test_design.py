from __future__ import annotations

from decimal import Decimal

from titan_sync.design import dictionary_rows, rule_rows, sync_design_tables
from titan_sync.run import sync_catalogue

from .conftest import FakeSource, needs_db


def rec(rid, fids, **cells):
    return {"id": rid, "createdTime": "2026-09-27T00:00:00.000Z", "fields": {fids[k]: v for k, v in cells.items()}}


def test_dictionary_row_coercion(ids):
    f = ids.design_dictionary_fields
    res = dictionary_rows([rec("recA", f, phrase="Warm, cozy", matches="Warm; COZY;\ncosy ; warm", kind="Preference",
                               undertone=["Warm"], tone_depth_min=2, tone_depth_max=4, width_min_in=7, active=True)], f)
    (row,) = res.rows
    assert row["matches"] == ["warm", "cozy", "cosy"]
    assert row["undertone"] == ["Warm"] and row["busyness"] == []
    assert (row["tone_depth_min"], row["tone_depth_max"]) == (2, 4)
    assert row["width_min_in"] == Decimal("7.00") and row["weight"] == 1
    assert row["active"] is True and not res.issues


def test_dictionary_needs_phrase_and_kind_and_fixes_reversed_ranges(ids):
    f = ids.design_dictionary_fields
    res = dictionary_rows([rec("recA", f, phrase="No kind"),
                           rec("recB", f, phrase="Backwards", kind="Avoid", tone_depth_min=5, tone_depth_max=4)], f)
    assert [r["phrase"] for r in res.rows] == ["Backwards"]
    assert (res.rows[0]["tone_depth_min"], res.rows[0]["tone_depth_max"]) == (4, 5)
    kinds = sorted(k for _, k, _ in res.issues)
    assert kinds == ["design_row_fixed", "design_row_skipped"]


def test_rules_need_required_cells_and_unique_keys(ids):
    f = ids.design_rules_fields
    ok = dict(rule="Pets: mid tones", key="pets_mid_tones", kind="Design", rule_when="Pets", effect="Boost",
              field="Tone depth", rule_values="2-3", weight=0.5, active=True)
    res = rule_rows([rec("r1", f, **ok), rec("r2", f, **ok), rec("r3", f, rule="No key", kind="Design")], f)
    assert [r["airtable_record_id"] for r in res.rows] == ["r1"]
    assert res.rows[0]["weight"] == Decimal("0.50")
    assert len(res.issues) == 2


@needs_db
def test_design_tables_ride_along_with_a_catalogue_run(db, settings, ids, reader):
    source = FakeSource(ids)
    source.add("recCAT1", sku="ENG-TEST-0001", product_name="Test Oak", category="LVP", active=True)
    fd, fr = ids.design_dictionary_fields, ids.design_rules_fields
    source.side_tables[ids.design_dictionary_table_id] = [
        rec("recD1", fd, phrase="Warm, cozy", matches="warm; cozy", kind="Preference", undertone=["Warm"], active=True, notes="internal"),
        rec("recD2", fd, phrase="Off", kind="Preference", active=False),
    ]
    source.side_tables[ids.design_rules_table_id] = [
        rec("recR1", fr, rule="Below grade needs waterproof", key="below_grade_waterproof", kind="Safety",
            rule_when="Below grade", effect="Require", field="Waterproof"),  # Active unticked: still served
        rec("recR2", fr, rule="Pets: mid tones", key="pets_mid_tones", kind="Design", rule_when="Pets",
            effect="Boost", field="Tone depth", rule_values="2-3", weight=0.5, active=True),
    ]
    counts = sync_catalogue(db, source, settings, mode="full")
    assert counts["design"] == {"design_dictionary": 2, "design_rules": 2}

    phrases = [r[0] for r in reader.execute("select phrase from api.design_dictionary order by phrase").fetchall()]
    assert phrases == ["Warm, cozy"]
    keys = [r[0] for r in reader.execute("select key from api.design_rules order by key").fetchall()]
    assert keys == ["below_grade_waterproof", "pets_mid_tones"]

    # a later run replaces the copy wholesale
    source.side_tables[ids.design_rules_table_id] = source.side_tables[ids.design_rules_table_id][:1]
    sync_catalogue(db, source, settings, mode="incremental")
    keys = [r[0] for r in reader.execute("select key from api.design_rules").fetchall()]
    assert keys == ["below_grade_waterproof"]


@needs_db
def test_an_empty_read_never_wipes_the_mirror(db, settings, ids):
    source = FakeSource(ids)
    fd = ids.design_dictionary_fields
    source.side_tables[ids.design_dictionary_table_id] = [rec("recD1", fd, phrase="Warm", kind="Preference", active=True)]
    run_id = db.start_run("incremental", trigger=None, github_run_id=None, watermark_before=None)
    assert sync_design_tables(db, source, ids, run_id)["design_dictionary"] == 1
    source.side_tables[ids.design_dictionary_table_id] = []
    assert sync_design_tables(db, source, ids, run_id)["design_dictionary"] == 1
    with db.conn.cursor() as cur:
        cur.execute("select count(*) from mirror.design_dictionary")
        assert cur.fetchone()[0] == 1
        cur.execute("select count(*) from mirror.sync_issues where kind = 'design_guard'")
        assert cur.fetchone()[0] == 1
