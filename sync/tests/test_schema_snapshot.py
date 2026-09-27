from titan_sync.schema_snapshot import diff


def test_diff_reports_new_changed_removed():
    snap = [{"id": "a", "name": "A", "type": "text"}, {"id": "b", "name": "B", "type": "date"}, {"id": "c", "name": "C", "type": "number"}]
    live = [{"id": "a", "name": "A", "type": "text"}, {"id": "b", "name": "Effective Date", "type": "date"}, {"id": "d", "name": "D", "type": "checkbox"}]
    lines = diff(snap, live)
    assert any(l.startswith("+ new field") and "'D'" in l for l in lines)
    assert any(l.startswith("~ changed") and "Effective Date" in l for l in lines)
    assert any(l.startswith("- removed") and "'C'" in l for l in lines)
    assert diff(snap, snap) == []
