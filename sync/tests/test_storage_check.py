"""Storage size alert (2026-10-31): the project went down when Storage passed the plan quota."""

from dataclasses import replace

from titan_sync import run as run_mod
from titan_sync.run import StorageCheck, check_storage, run_images

from .conftest import needs_db

MB = 1024 * 1024


def _check(used_mb: float, limit_mb: int = 1024) -> StorageCheck:
    return StorageCheck(used_bytes=int(used_mb * MB), limit_bytes=limit_mb * MB,
                        by_bucket={"catalogue-images": int(used_mb * MB)}, warn_ratio=0.8, stop_ratio=0.95)


def test_thresholds():
    assert not _check(600).warn and not _check(600).stop
    assert _check(820).warn and not _check(820).stop
    assert _check(980).warn and _check(980).stop


def test_markdown_names_the_numbers_and_the_fix():
    ok = _check(580).markdown()
    assert "580 MB of 1,024 MB (57%)" in ok and "ok" in ok and "Upgrade" not in ok
    warn = _check(900).markdown()
    assert "WARNING" in warn and "sign-in" in warn and "`catalogue-images`" in warn
    assert "STOP" in _check(1000).markdown()


@needs_db
def test_worker_can_read_usage(db, settings):
    usage = check_storage(db, settings)   # through the definer function; local harness has no objects
    assert usage.used_bytes >= 0 and usage.limit_bytes == settings.storage_limit_mb * MB


@needs_db
def test_images_run_uploads_nothing_when_storage_is_nearly_full(db, settings, storage, monkeypatch):
    s = replace(settings, supabase_url="https://x.supabase.co", service_role_key="k")
    monkeypatch.setattr(run_mod, "check_storage", lambda _db, _s: _check(1000))
    counts = run_images(db, s, None, batch=50, storage=storage)
    assert counts["images_processed"] == 0 and storage.calls == []
    with db.conn.cursor() as cur:
        cur.execute("select kind from mirror.sync_issues where run_id = (select max(id) from mirror.sync_runs)")
        assert [r[0] for r in cur.fetchall()] == ["storage_full"]
