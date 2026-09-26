from __future__ import annotations

import io
import os
from datetime import datetime, timedelta, timezone
from typing import Any, Iterator

import pytest
from PIL import Image

from titan_sync.config import AirtableIds, Settings
from titan_sync.db import Db
from titan_sync.storage import FakeStorage

LOCAL_DB_URL = "postgresql://sync_worker:sync_worker@127.0.0.1:5432/titan_desk_test"
LOCAL_READER_URL = "postgresql://titan_test_reader:reader@127.0.0.1:5432/titan_desk_test"


def _db_url() -> str | None:
    url = os.environ.get("DATABASE_URL") or LOCAL_DB_URL
    try:
        import psycopg
        with psycopg.connect(url, connect_timeout=2) as c:
            c.execute("select 1 from mirror.catalogue limit 0")
        return url
    except Exception:
        return None


DB_URL = _db_url()
needs_db = pytest.mark.skipif(DB_URL is None, reason="no database with migration 001 reachable (set DATABASE_URL or run make db-reset)")


@pytest.fixture(scope="session")
def ids() -> AirtableIds:
    return AirtableIds.load()


@pytest.fixture
def settings(ids: AirtableIds) -> Settings:
    return Settings(
        airtable_token="pat-test", database_url=DB_URL, supabase_url="http://127.0.0.1:54321",
        service_role_key="service-test", image_batch=50, purge_days=30, deletion_guard_min_rows=3, deletion_guard_ratio=0.5, ids=ids,
    )


@pytest.fixture
def db() -> Iterator[Db]:
    if DB_URL is None:
        pytest.skip("no database")
    d = Db(DB_URL)
    with d.conn.cursor() as cur:
        for t in ("catalogue_images", "sync_issues", "sync_runs", "sync_state", "catalogue"):
            cur.execute(f"delete from mirror.{t}")
    d.commit()
    yield d
    d.rollback()
    d.close()


@pytest.fixture
def reader() -> Iterator[Any]:
    """A connection that can read api.* views (authenticated-like locally; DATABASE_URL in CI)."""
    import psycopg
    url = os.environ.get("TITAN_TEST_READER_URL") or (os.environ.get("DATABASE_URL") if os.environ.get("DATABASE_URL") else LOCAL_READER_URL)
    try:
        conn = psycopg.connect(url, connect_timeout=2, autocommit=True)
        if "titan_test_reader" in url:
            conn.execute("set role authenticated")
    except Exception:
        pytest.skip("no reader connection")
    yield conn
    conn.close()


@pytest.fixture
def storage() -> FakeStorage:
    return FakeStorage()


class FakeSource:
    """Airtable stand-in: records keyed by field id, with a modified time for incremental filtering."""

    def __init__(self, ids: AirtableIds, records: list[dict[str, Any]] | None = None):
        self.ids = ids
        self.records: list[dict[str, Any]] = records or []
        self.api_calls = 0
        self.page_size = 3

    def make(self, rec_id: str, *, modified: datetime | None = None, created: str = "2026-01-01T00:00:00.000Z",
             **by_key: Any) -> dict[str, Any]:
        fields = {}
        for key, value in by_key.items():
            fid = self.ids.fields[key]
            assert fid, f"no field id for {key}"
            fields[fid] = value
        rec = {"id": rec_id, "createdTime": created, "fields": fields,
               "_modified": modified or datetime.now(timezone.utc)}
        return rec

    def add(self, rec_id: str, **kw: Any) -> dict[str, Any]:
        rec = self.make(rec_id, **kw)
        self.records = [r for r in self.records if r["id"] != rec_id] + [rec]
        return rec

    def iter_pages(self, since: datetime | None):
        recs = [r for r in self.records if since is None or r["_modified"] > since]
        for i in range(0, len(recs), self.page_size):
            self.api_calls += 1
            yield [{k: v for k, v in r.items() if k != "_modified"} for r in recs[i:i + self.page_size]]
        if not recs:
            self.api_calls += 1

    def get_record(self, record_id: str):
        self.api_calls += 1
        for r in self.records:
            if r["id"] == record_id:
                return {k: v for k, v in r.items() if k != "_modified"}
        return None

    def table_schema(self):
        self.api_calls += 1
        return []


@pytest.fixture
def source(ids: AirtableIds) -> FakeSource:
    return FakeSource(ids)


# ---- image fixtures (generated, so the repo carries no binaries) ---------------------------

def _png_with_alpha() -> bytes:
    im = Image.new("RGBA", (300, 200), (255, 0, 0, 0))
    for x in range(150):
        for y in range(200):
            im.putpixel((x, y), (255, 0, 0, 255))
    buf = io.BytesIO(); im.save(buf, "PNG"); return buf.getvalue()


def _jpeg_rotated() -> bytes:
    """A 400×200 landscape JPEG tagged Orientation=6: viewers show it as 200×400 portrait."""
    im = Image.new("RGB", (400, 200), (10, 200, 30))
    exif = Image.Exif(); exif[0x0112] = 6
    buf = io.BytesIO(); im.save(buf, "JPEG", quality=90, exif=exif.tobytes()); return buf.getvalue()


def _cmyk_jpeg() -> bytes:
    im = Image.new("CMYK", (120, 80), (255, 0, 0, 0))  # pure cyan
    buf = io.BytesIO(); im.save(buf, "JPEG", quality=95); return buf.getvalue()


def _jpeg_800() -> bytes:
    im = Image.new("RGB", (800, 600), (120, 80, 40))
    buf = io.BytesIO(); im.save(buf, "JPEG", quality=90); return buf.getvalue()


def _jpeg_big() -> bytes:
    im = Image.new("RGB", (2400, 1600), (200, 180, 150))
    buf = io.BytesIO(); im.save(buf, "JPEG", quality=85); return buf.getvalue()


def _heic() -> bytes | None:
    try:
        im = Image.new("RGB", (640, 480), (90, 60, 30))
        buf = io.BytesIO(); im.save(buf, format="HEIF", quality=90); return buf.getvalue()
    except Exception:
        return None


def _gif_animated() -> bytes:
    a = Image.new("P", (50, 50), 0); b = Image.new("P", (50, 50), 1)
    buf = io.BytesIO(); a.save(buf, "GIF", save_all=True, append_images=[b], duration=100, loop=0); return buf.getvalue()


FIXTURE_IMAGES = {
    "alpha.png": _png_with_alpha,
    "rotated.jpg": _jpeg_rotated,
    "cmyk.jpg": _cmyk_jpeg,
    "small800.jpg": _jpeg_800,
    "big.jpg": _jpeg_big,
    "photo.heic": _heic,
    "anim.gif": _gif_animated,
    "spec.pdf": lambda: b"%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n%%EOF\n",
    "clip.mp4": lambda: b"\x00\x00\x00\x18ftypmp42" + b"\x00" * 64,
}


@pytest.fixture(scope="session")
def images() -> dict[str, bytes | None]:
    return {name: fn() for name, fn in FIXTURE_IMAGES.items()}
