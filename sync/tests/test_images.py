import io
from datetime import datetime, timedelta, timezone

import pytest
from PIL import Image

from titan_sync.images import (BUCKET_IMAGES, BUCKET_ORIGINALS, DownloadExpired, ImageSync, SkippedFile,
                               process_image, sku_safe)

from .conftest import needs_db


# ---- pure processing ---------------------------------------------------------------------

def _open(b: bytes) -> Image.Image:
    return Image.open(io.BytesIO(b))


def test_sku_safe():
    assert sku_safe("GM.B.CARRAR.5/8X5/8") == "GM.B.CARRAR.5_8X5_8"
    assert sku_safe("ENG-VIDR-0042") == "ENG-VIDR-0042"


def test_png_alpha_flattened_on_white(images):
    p = process_image(images["alpha.png"])
    assert p.mime == "image/png" and p.ext == "png"
    im = _open(p.variants[1600][0]).convert("RGB")
    assert im.size == (300, 200)                      # never upscaled
    assert im.getpixel((290, 100)) == (255, 255, 255)  # transparent half → white
    r, g, b = im.getpixel((10, 100)); assert r > 200 and g < 60 and b < 60


def test_jpeg_exif_rotation_is_applied(images):
    p = process_image(images["rotated.jpg"])
    assert (p.width, p.height) == (200, 400)
    assert _open(p.variants[200][0]).size == (100, 200)
    assert _open(p.variants[600][0]).size == (200, 400)  # source smaller than 600 → capped


def test_cmyk_jpeg_converted_to_srgb(images):
    p = process_image(images["cmyk.jpg"])
    r, g, b = _open(p.variants[200][0]).convert("RGB").getpixel((50, 30))
    assert r < 40 and g > 200 and b > 200  # pure cyan


def test_800px_source_never_upscaled_and_low_res(images):
    p = process_image(images["small800.jpg"])
    assert p.low_res is True
    assert _open(p.variants[1600][0]).size == (800, 600)
    assert _open(p.variants[600][0]).size == (600, 450)
    assert _open(p.variants[200][0]).size == (200, 150)


def test_big_source_all_three_sizes_and_blurhash(images):
    p = process_image(images["big.jpg"])
    assert p.low_res is False and (p.width, p.height) == (2400, 1600)
    assert _open(p.variants[1600][0]).size == (1600, 1067)
    assert _open(p.variants[200][0]).format == "WEBP"
    assert isinstance(p.blurhash, str) and len(p.blurhash) >= 6
    assert p.master_jpg is None


def test_variants_carry_no_metadata(images):
    p = process_image(images["rotated.jpg"])
    v = _open(p.variants[600][0])
    assert not v.getexif() and "icc_profile" not in v.info


def test_heic_gets_master_jpeg(images):
    if images["photo.heic"] is None:
        pytest.skip("pillow-heif has no HEIF encoder in this build")
    p = process_image(images["photo.heic"])
    assert p.mime == "image/heic" and p.ext == "heic"
    assert p.master_jpg is not None
    m = _open(p.master_jpg)
    assert m.format == "JPEG" and m.size == (640, 480)


@pytest.mark.parametrize("name,reason", [("spec.pdf", "not a decodable"), ("clip.mp4", "not a decodable"), ("anim.gif", "unsupported format GIF")])
def test_non_images_are_skipped_not_fatal(images, name, reason):
    with pytest.raises(SkippedFile) as e:
        process_image(images[name])
    assert reason in str(e.value)


def test_oversize_is_skipped():
    with pytest.raises(SkippedFile):
        process_image(b"x" * (25 * 1024 * 1024 + 1))


# ---- the sync job against the database + fake storage ------------------------------------------

pytestmark_db = needs_db


def _q(db, sql, *args):
    with db.conn.cursor() as cur:
        cur.execute(sql, args)
        return cur.fetchall()


def _catalogue_row(db, rec_id, sku, attachments):
    with db.conn.cursor() as cur:
        cur.execute(
            "insert into mirror.catalogue (airtable_record_id, airtable_modified_at, sku, product_name, active, image_attachments) "
            "values (%s, now(), %s, %s, true, %s) on conflict (airtable_record_id) do update set image_attachments = excluded.image_attachments",
            (rec_id, sku, sku, db.jsonb(attachments)),
        )
    db.commit()


def _att(kind, att_id, url, sort=0, filename=None):
    return {"kind": kind, "id": att_id, "url": url, "filename": filename or f"{att_id}.jpg", "type": "image/jpeg", "size": 1, "sort": sort}


class Fetcher:
    def __init__(self, files: dict[str, bytes]):
        self.files = files
        self.calls: list[str] = []
        self.expired: set[str] = set()

    def __call__(self, url: str) -> bytes:
        self.calls.append(url)
        if url in self.expired:
            raise DownloadExpired("HTTP 403")
        if url not in self.files:
            raise DownloadExpired("HTTP 404")
        return self.files[url]


@needs_db
def test_image_sync_end_to_end(db, reader, storage, source, images):
    files = {"http://img/big": images["big.jpg"], "http://img/alpha": images["alpha.png"], "http://img/pdf": images["spec.pdf"]}
    fetch = Fetcher(files)
    _catalogue_row(db, "recA", "ENG-VIDR-0042", [
        _att("swatch", "att1", "http://img/big", 0), _att("detail", "att2", "http://img/alpha", 0, "detail.png"),
        _att("detail", "att3", "http://img/pdf", 1, "spec.pdf"),
    ])
    run_id = db.start_run("images", trigger="test", github_run_id=None, watermark_before=None)
    job = ImageSync(db=db, storage=storage, source=source, public_base_url="https://x/cat", run_id=run_id, fetch=fetch)
    c = job.run(batch=50)
    assert (c.processed, c.skipped, c.failed) == (2, 1, 0)

    rows = _q(db, "select kind, low_res, original_path, master_jpg_path, variant_paths, width, height from mirror.catalogue_images where deleted_at is null order by kind, sort_order")
    assert [r[0] for r in rows] == ["detail", "swatch"]
    swatch = rows[1]
    sha = swatch[2].split("/")[1].split(".")[0]
    assert swatch[2] == f"ENG-VIDR-0042/{sha}.jpg" and swatch[3] is None and swatch[1] is False and (swatch[5], swatch[6]) == (1600, 1067)
    assert swatch[4]["1600"]["path"] == f"ENG-VIDR-0042/{sha}_1600.webp"
    # objects: original in the private bucket, three variants in the public bucket
    assert (BUCKET_ORIGINALS, f"ENG-VIDR-0042/{sha}.jpg") in storage.objects
    for size in (200, 600, 1600):
        assert (BUCKET_IMAGES, f"ENG-VIDR-0042/{sha}_{size}.webp") in storage.objects
    # the PDF is reported, not fatal, and remembered so it is not downloaded again
    issues = _q(db, "select kind, message from mirror.sync_issues where run_id = %s", run_id)
    assert any(k == "image_skipped" and "spec.pdf" in m for k, m in issues)
    assert _q(db, "select filename, reason from mirror.catalogue_image_skips")[0][0] == "spec.pdf"
    # the view exposes URLs and the hero
    hero = reader.execute("select hero ->> 'kind', hero ->> 'thumb', jsonb_array_length(images) from api.catalogue_staff where sku = 'ENG-VIDR-0042'").fetchone()
    assert hero[0] == "swatch" and hero[1] == f"https://x/cat/ENG-VIDR-0042/{sha}_200.webp?v=1" and hero[2] == 2

    # second run: nothing new, nothing re-uploaded
    uploads_before = len(storage.uploads())
    c2 = ImageSync(db=db, storage=storage, source=source, public_base_url="https://x/cat", run_id=run_id, fetch=fetch).run(50)
    assert c2.processed == 0 and len(storage.uploads()) == uploads_before

    # same bytes added to another field of the same SKU: new index row, no upload, no download
    fetch.files["http://img/big2"] = images["big.jpg"]
    _catalogue_row(db, "recA", "ENG-VIDR-0042", [
        _att("swatch", "att1", "http://img/big", 0), _att("room", "att4", "http://img/big2", 0),
        _att("detail", "att2", "http://img/alpha", 0, "detail.png"), _att("detail", "att3", "http://img/pdf", 1, "spec.pdf"),
    ])
    c3 = ImageSync(db=db, storage=storage, source=source, public_base_url="https://x/cat", run_id=run_id, fetch=fetch).run(50)
    assert c3.reused == 1 and len(storage.uploads()) == uploads_before
    assert _q(db, "select count(*) from mirror.catalogue_images where kind = 'room' and deleted_at is null")[0][0] == 1

    # same bytes on another SKU: server-side copy, no download/encode
    fetch.files["http://img/big3"] = images["big.jpg"]
    _catalogue_row(db, "recB", "ENG-VIDR-0043", [_att("swatch", "att9", "http://img/big3", 0)])
    calls_before = len(fetch.calls)
    c4 = ImageSync(db=db, storage=storage, source=source, public_base_url="https://x/cat", run_id=run_id, fetch=fetch).run(50)
    assert c4.reused == 1 and len(storage.uploads()) == uploads_before
    assert len(fetch.calls) == calls_before + 1  # one download to hash the bytes
    assert (BUCKET_IMAGES, f"ENG-VIDR-0043/{sha}_600.webp") in storage.objects
    assert any(op == "copy" for op, _b, _p in storage.calls)

    # remove the swatch in Airtable → soft delete; re-add it → undelete without download
    _catalogue_row(db, "recA", "ENG-VIDR-0042", [_att("detail", "att2", "http://img/alpha", 0, "detail.png")])
    job = ImageSync(db=db, storage=storage, source=source, public_base_url="https://x/cat", run_id=run_id, fetch=fetch)
    job.run(50)
    assert _q(db, "select deleted_at is not null from mirror.catalogue_images where airtable_attachment_id = 'att1'")[0][0] is True
    assert job.counts.soft_deleted == 2  # swatch att1 and room att4
    calls_before = len(fetch.calls)
    _catalogue_row(db, "recA", "ENG-VIDR-0042", [_att("swatch", "att1", "http://img/big", 0), _att("detail", "att2", "http://img/alpha", 0, "detail.png")])
    c5 = ImageSync(db=db, storage=storage, source=source, public_base_url="https://x/cat", run_id=run_id, fetch=fetch).run(50)
    assert c5.undeleted == 1 and len(fetch.calls) == calls_before
    assert _q(db, "select deleted_at from mirror.catalogue_images where airtable_attachment_id = 'att1'")[0][0] is None


@needs_db
def test_expired_url_is_refreshed_from_airtable(db, storage, source, images):
    fetch = Fetcher({"http://img/fresh": images["small800.jpg"]})
    fetch.expired.add("http://img/stale")
    _catalogue_row(db, "recC", "T-SKU-C", [_att("swatch", "attS", "http://img/stale", 0)])
    source.add("recC", sku="T-SKU-C", swatch_images=[{"id": "attS", "url": "http://img/fresh", "filename": "s.jpg", "type": "image/jpeg", "size": 1}])
    run_id = db.start_run("images", trigger="test", github_run_id=None, watermark_before=None)
    c = ImageSync(db=db, storage=storage, source=source, public_base_url="https://x/cat", run_id=run_id, fetch=fetch).run(50)
    assert c.processed == 1 and fetch.calls == ["http://img/stale", "http://img/fresh"]
    assert source.api_calls == 1
    assert _q(db, "select image_attachments -> 0 ->> 'url' from mirror.catalogue where airtable_record_id = 'recC'")[0][0] == "http://img/fresh"
    assert _q(db, "select low_res from mirror.catalogue_images where airtable_attachment_id = 'attS'")[0][0] is True


@needs_db
def test_purge_removes_variants_only_and_keeps_originals(db, storage, source, images):
    fetch = Fetcher({"http://img/a": images["small800.jpg"]})
    _catalogue_row(db, "recP", "T-SKU-P", [_att("swatch", "attP", "http://img/a", 0)])
    run_id = db.start_run("images", trigger="test", github_run_id=None, watermark_before=None)
    job = ImageSync(db=db, storage=storage, source=source, public_base_url="https://x/cat", run_id=run_id, fetch=fetch)
    job.run(50)
    originals = [k for k in storage.objects if k[0] == BUCKET_ORIGINALS]
    variants = [k for k in storage.objects if k[0] == BUCKET_IMAGES]
    assert len(originals) == 1 and len(variants) == 3

    _catalogue_row(db, "recP", "T-SKU-P", [])
    job.run(50)
    with db.conn.cursor() as cur:  # pretend 40 days passed
        cur.execute("update mirror.catalogue_images set deleted_at = now() - interval '40 days' where airtable_attachment_id = 'attP'")
    db.commit()
    assert job.purge(days=30) == 1
    assert [k for k in storage.objects if k[0] == BUCKET_IMAGES] == []
    assert [k for k in storage.objects if k[0] == BUCKET_ORIGINALS] == originals   # never purged
    row = _q(db, "select variants_purged_at is not null, orphaned_at is not null from mirror.catalogue_images where airtable_attachment_id = 'attP'")[0]
    assert row == (True, True)
    # purging again does nothing
    assert job.purge(days=30) == 0
