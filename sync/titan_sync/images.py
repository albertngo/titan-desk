"""Image pipeline: Airtable attachments → originals (private bucket) + WebP variants (public bucket)
+ index rows in mirror.catalogue_images.

Processing rules (in this order, for every image):
  1. ImageOps.exif_transpose()      phone photos come out upright
  2. convert to sRGB via embedded ICC profile (CMYK, Display P3), else assume sRGB
  3. flatten transparency onto white
  4. strip all metadata from variants (nothing from im.info is written)
  5. resize long edge to 200 / 600 / 1600, never upscaling (low_res when long edge < 1600)
  6. WebP quality 80, method 6
  7. blurhash from the 200 px variant
HEIC/HEIF sources also get a full-resolution JPEG master (quality 92) in the originals bucket.
Anything that is not JPEG/PNG/WebP/HEIC/HEIF/TIFF is skipped and reported, never fatal.
"""

from __future__ import annotations

import hashlib
import io
import json
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Callable

import blurhash
import httpx
from PIL import Image, ImageCms, ImageOps
from pillow_heif import register_heif_opener

from .airtable import Source
from .db import Db
from .storage import Storage

register_heif_opener()

ENCODER_VERSION = 1
VARIANT_SIZES = (200, 600, 1600)
WEBP_QUALITY = 80
WEBP_METHOD = 6
MASTER_JPG_QUALITY = 92
MAX_BYTES = 25 * 1024 * 1024
BUCKET_IMAGES = "catalogue-images"
BUCKET_ORIGINALS = "catalogue-originals"

# Pillow format name → (mime, extension)
ACCEPTED_FORMATS: dict[str, tuple[str, str]] = {
    "JPEG": ("image/jpeg", "jpg"),
    "PNG": ("image/png", "png"),
    "WEBP": ("image/webp", "webp"),
    "HEIF": ("image/heic", "heic"),
    "TIFF": ("image/tiff", "tif"),
}


class SkippedFile(Exception):
    """Not an accepted image; recorded in the sync report, never fails the run."""


class DownloadExpired(Exception):
    """Airtable attachment URL no longer valid (they expire ~2 h after the API response)."""


def sku_safe(sku: str) -> str:
    """SKUs may contain '/' (30 live ones do) and dots; keep the path a single segment."""
    return re.sub(r"[^A-Za-z0-9._-]", "_", sku)


@dataclass
class Processed:
    sha256: str
    mime: str
    ext: str
    width: int
    height: int
    low_res: bool
    variants: dict[int, tuple[bytes, int, int]]   # size → (webp bytes, w, h)
    blurhash: str
    master_jpg: bytes | None = None


def _to_srgb_rgb(im: Image.Image) -> Image.Image:
    """Steps 2 + 3: colour-manage into sRGB and flatten transparency onto white."""
    icc = im.info.get("icc_profile")
    alpha: Image.Image | None = None
    if im.mode == "P" and "transparency" in im.info:
        im = im.convert("RGBA")
    if im.mode in ("RGBA", "LA"):
        im = im.convert("RGBA")
        alpha = im.getchannel("A")
        base = im.convert("RGB")
    elif im.mode == "CMYK":
        base = im
    elif im.mode == "RGB":
        base = im
    else:  # L, I, I;16, 1, YCbCr, …
        base = im.convert("RGB")

    if icc and base.mode in ("RGB", "CMYK"):
        try:
            src = ImageCms.ImageCmsProfile(io.BytesIO(icc))
            base = ImageCms.profileToProfile(base, src, ImageCms.createProfile("sRGB"), outputMode="RGB")
        except Exception:
            base = base.convert("RGB")
    elif base.mode != "RGB":
        base = base.convert("RGB")

    if alpha is not None:
        flat = Image.new("RGB", base.size, (255, 255, 255))
        flat.paste(base, mask=alpha)
        base = flat
    base.info = {}  # step 4: nothing from the source's metadata reaches the variants
    return base


def _fit(im: Image.Image, target: int) -> Image.Image:
    w, h = im.size
    long = max(w, h)
    if long <= target:
        return im.copy()
    scale = target / long
    return im.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.Resampling.LANCZOS)


def _webp(im: Image.Image) -> bytes:
    buf = io.BytesIO()
    im.save(buf, format="WEBP", quality=WEBP_QUALITY, method=WEBP_METHOD)
    return buf.getvalue()


def process_image(data: bytes) -> Processed:
    if len(data) > MAX_BYTES:
        raise SkippedFile(f"file is {len(data) / 1e6:.1f} MB, above the 25 MB limit")
    try:
        im = Image.open(io.BytesIO(data))
        fmt = im.format
        if fmt not in ACCEPTED_FORMATS:
            raise SkippedFile(f"unsupported format {fmt or 'unknown'}")
        if getattr(im, "n_frames", 1) > 1:
            raise SkippedFile("animated image")
        im.load()
    except SkippedFile:
        raise
    except Exception as e:  # not an image at all (PDF, video, corrupt)
        raise SkippedFile(f"not a decodable image ({type(e).__name__})") from e

    mime, ext = ACCEPTED_FORMATS[fmt]
    im = ImageOps.exif_transpose(im) or im          # 1
    rgb = _to_srgb_rgb(im)                          # 2, 3, 4
    width, height = rgb.size
    long = max(width, height)
    variants: dict[int, tuple[bytes, int, int]] = {}
    for size in VARIANT_SIZES:                      # 5, 6
        v = _fit(rgb, size)
        variants[size] = (_webp(v), *v.size)
    thumb = _fit(rgb, VARIANT_SIZES[0])
    bh = blurhash.encode(thumb, x_components=4, y_components=3)   # 7
    master = None
    if fmt == "HEIF":
        buf = io.BytesIO()
        rgb.save(buf, format="JPEG", quality=MASTER_JPG_QUALITY, optimize=True)
        master = buf.getvalue()
    return Processed(
        sha256=hashlib.sha256(data).hexdigest(), mime=mime, ext=ext,
        width=width, height=height, low_res=long < VARIANT_SIZES[-1],
        variants=variants, blurhash=bh, master_jpg=master,
    )


def http_fetch(url: str) -> bytes:
    r = httpx.get(url, timeout=60, follow_redirects=True)
    if r.status_code in (403, 404, 410):
        raise DownloadExpired(f"HTTP {r.status_code}")
    r.raise_for_status()
    return r.content


@dataclass
class ImageCounts:
    processed: int = 0
    reused: int = 0
    undeleted: int = 0
    soft_deleted: int = 0
    skipped: int = 0
    failed: int = 0
    purged: int = 0


@dataclass
class ImageSync:
    db: Db
    storage: Storage
    source: Source | None
    public_base_url: str
    run_id: int | None = None
    fetch: Callable[[str], bytes] = http_fetch
    counts: ImageCounts = field(default_factory=ImageCounts)

    # ---- paths --------------------------------------------------------------------------------
    @staticmethod
    def paths(sku: str, sha: str, ext: str, has_master: bool) -> dict[str, Any]:
        base = f"{sku_safe(sku)}/{sha}"
        return {
            "original": f"{base}.{ext}",
            "master": f"{base}_master.jpg" if has_master else None,
            "variants": {str(s): f"{base}_{s}.webp" for s in VARIANT_SIZES},
        }

    # ---- diff ---------------------------------------------------------------------------------
    def soft_delete_removed(self) -> int:
        """Index rows whose attachment is no longer in the record's image fields (or whose record is gone)."""
        with self.db.conn.cursor() as cur:
            cur.execute(
                """
                update mirror.catalogue_images i
                   set deleted_at = now()
                 where i.deleted_at is null
                   and not exists (
                     select 1 from mirror.catalogue c, jsonb_array_elements(c.image_attachments) a
                      where c.airtable_record_id = i.airtable_record_id
                        and a ->> 'kind' = i.kind and a ->> 'id' = i.airtable_attachment_id)
                """
            )
            n = cur.rowcount
        self.db.commit()
        self.counts.soft_deleted += n
        return n

    def pending(self, limit: int) -> list[dict[str, Any]]:
        with self.db.conn.cursor() as cur:
            cur.execute(
                """
                select c.airtable_record_id, c.sku, a ->> 'kind', a ->> 'id', a ->> 'url', a ->> 'filename',
                       a ->> 'type', (a ->> 'sort')::int
                  from mirror.catalogue c, jsonb_array_elements(c.image_attachments) a
                 where not exists (
                         select 1 from mirror.catalogue_images i
                          where i.airtable_record_id = c.airtable_record_id
                            and i.kind = a ->> 'kind' and i.airtable_attachment_id = a ->> 'id'
                            and i.deleted_at is null)
                   and not exists (
                         select 1 from mirror.catalogue_image_skips s
                          where s.airtable_record_id = c.airtable_record_id
                            and s.kind = a ->> 'kind' and s.airtable_attachment_id = a ->> 'id')
                 order by c.airtable_modified_at desc, c.sku, a ->> 'kind', (a ->> 'sort')::int
                 limit %s
                """,
                (limit,),
            )
            cols = ("record_id", "sku", "kind", "att_id", "url", "filename", "type", "sort")
            return [dict(zip(cols, r)) for r in cur.fetchall()]

    # ---- one attachment -------------------------------------------------------------------------
    def _issue(self, kind: str, message: str, item: dict[str, Any]) -> None:
        self.db.add_issue(self.run_id, kind, f"{item.get('filename') or item['att_id']}: {message}",
                          record_id=item["record_id"], sku=item["sku"], field=item["kind"])

    def _refresh_url(self, item: dict[str, Any]) -> str | None:
        """Re-read the record for a fresh attachment URL and refresh what the mirror stores."""
        if self.source is None:
            return None
        record = self.source.get_record(item["record_id"])
        if not record:
            return None
        fresh: dict[str, str] = {}
        for value in (record.get("fields") or {}).values():
            if isinstance(value, list):
                for att in value:
                    if isinstance(att, dict) and att.get("id") and att.get("url"):
                        fresh[att["id"]] = att["url"]
        if fresh:
            with self.db.conn.cursor() as cur:
                cur.execute("select image_attachments from mirror.catalogue where airtable_record_id = %s", (item["record_id"],))
                row = cur.fetchone()
                if row:
                    atts = row[0]
                    for a in atts:
                        if a.get("id") in fresh:
                            a["url"] = fresh[a["id"]]
                    cur.execute("update mirror.catalogue set image_attachments = %s where airtable_record_id = %s",
                                (self.db.jsonb(atts), item["record_id"]))
            self.db.commit()
        return fresh.get(item["att_id"])

    def _download(self, item: dict[str, Any]) -> bytes:
        url = item.get("url")
        if url:
            try:
                return self.fetch(url)
            except DownloadExpired:
                pass
        fresh = self._refresh_url(item)
        if not fresh:
            raise DownloadExpired("no valid URL for this attachment")
        return self.fetch(fresh)

    def _row_by_attachment(self, item: dict[str, Any]) -> tuple[int, bool] | None:
        with self.db.conn.cursor() as cur:
            cur.execute(
                "select id, variants_purged_at is not null from mirror.catalogue_images "
                "where airtable_record_id = %s and kind = %s and airtable_attachment_id = %s",
                (item["record_id"], item["kind"], item["att_id"]),
            )
            r = cur.fetchone()
            return (r[0], r[1]) if r else None

    def _row_by_hash(self, item: dict[str, Any], sha: str) -> tuple[int, bool] | None:
        with self.db.conn.cursor() as cur:
            cur.execute(
                "select id, variants_purged_at is not null from mirror.catalogue_images "
                "where airtable_record_id = %s and kind = %s and source_hash = %s",
                (item["record_id"], item["kind"], sha),
            )
            r = cur.fetchone()
            return (r[0], r[1]) if r else None

    def _reusable_by_hash(self, sha: str) -> dict[str, Any] | None:
        """A live row anywhere with the same bytes and encoder: copy its objects, skip the encode."""
        with self.db.conn.cursor() as cur:
            cur.execute(
                """
                select sku, original_path, original_mime, original_bytes, original_width, original_height,
                       master_jpg_path, low_res, variant_paths, width, height, blurhash
                  from mirror.catalogue_images
                 where source_hash = %s and encoder_version = %s and variants_purged_at is null
                 order by deleted_at nulls first, id
                 limit 1
                """,
                (sha, ENCODER_VERSION),
            )
            r = cur.fetchone()
            if not r:
                return None
            cols = ("sku", "original_path", "original_mime", "original_bytes", "original_width", "original_height",
                    "master_jpg_path", "low_res", "variant_paths", "width", "height", "blurhash")
            return dict(zip(cols, r))

    def _undelete(self, row_id: int, item: dict[str, Any]) -> None:
        with self.db.conn.cursor() as cur:
            cur.execute(
                "update mirror.catalogue_images set deleted_at = null, orphaned_at = null, airtable_attachment_id = %s, sort_order = %s where id = %s",
                (item["att_id"], item["sort"] or 0, row_id),
            )
        self.db.commit()

    def _upsert_row(self, item: dict[str, Any], sha: str, meta: dict[str, Any], variant_paths: dict[str, Any],
                    *, existing_id: int | None) -> None:
        params = {
            "record_id": item["record_id"], "sku": item["sku"], "kind": item["kind"], "att_id": item["att_id"],
            "sort": item["sort"] or 0, "sha": sha, "original_path": meta["original_path"], "mime": meta["original_mime"],
            "bytes": meta["original_bytes"], "ow": meta["original_width"], "oh": meta["original_height"],
            "master": meta["master_jpg_path"], "low_res": meta["low_res"], "vp": self.db.jsonb(variant_paths),
            "w": meta["width"], "h": meta["height"], "bh": meta["blurhash"], "ver": ENCODER_VERSION,
            "base": self.public_base_url,
        }
        with self.db.conn.cursor() as cur:
            if existing_id is None:
                cur.execute(
                    """
                    insert into mirror.catalogue_images
                      (airtable_record_id, sku, kind, airtable_attachment_id, sort_order, source_hash, original_path, original_mime,
                       original_bytes, original_width, original_height, master_jpg_path, low_res, variant_paths, width, height,
                       blurhash, encoder_version, public_base_url)
                    values (%(record_id)s, %(sku)s, %(kind)s, %(att_id)s, %(sort)s, %(sha)s, %(original_path)s, %(mime)s,
                            %(bytes)s, %(ow)s, %(oh)s, %(master)s, %(low_res)s, %(vp)s, %(w)s, %(h)s, %(bh)s, %(ver)s, %(base)s)
                    """,
                    params,
                )
            else:
                params["id"] = existing_id
                cur.execute(
                    """
                    update mirror.catalogue_images
                       set airtable_attachment_id = %(att_id)s, sort_order = %(sort)s, original_path = %(original_path)s,
                           original_mime = %(mime)s, original_bytes = %(bytes)s, original_width = %(ow)s, original_height = %(oh)s,
                           master_jpg_path = %(master)s, low_res = %(low_res)s, variant_paths = %(vp)s, width = %(w)s, height = %(h)s,
                           blurhash = %(bh)s, encoder_version = %(ver)s, public_base_url = %(base)s,
                           deleted_at = null, variants_purged_at = null, orphaned_at = null
                     where id = %(id)s
                    """,
                    params,
                )
        self.db.commit()

    def _upload_all(self, item: dict[str, Any], p: Processed, paths: dict[str, Any], data: bytes) -> None:
        self.storage.upload(BUCKET_ORIGINALS, paths["original"], data, p.mime)
        if p.master_jpg is not None and paths["master"]:
            self.storage.upload(BUCKET_ORIGINALS, paths["master"], p.master_jpg, "image/jpeg")
        for size, (webp, _w, _h) in p.variants.items():
            self.storage.upload(BUCKET_IMAGES, paths["variants"][str(size)], webp, "image/webp")

    def process_item(self, item: dict[str, Any]) -> str:
        """Returns one of: processed | reused | undeleted | skipped | failed."""
        # Same attachment id seen before (soft-deleted): bring it back without a download.
        prior = self._row_by_attachment(item)
        if prior and not prior[1]:
            self._undelete(prior[0], item)
            self.counts.undeleted += 1
            return "undeleted"

        try:
            data = self._download(item)
        except (DownloadExpired, httpx.HTTPError) as e:
            self._issue("image_failed", f"download failed ({e})", item)
            self.counts.failed += 1
            return "failed"

        sha = hashlib.sha256(data).hexdigest()

        # Same bytes already indexed for this record+kind (e.g. removed then re-added).
        by_hash = self._row_by_hash(item, sha)
        if by_hash and not by_hash[1]:
            self._undelete(by_hash[0], item)
            self.counts.undeleted += 1
            return "undeleted"
        existing_id = (by_hash or prior or (None, None))[0]

        # Same bytes live elsewhere: server-side copy, no encode.
        reusable = self._reusable_by_hash(sha)
        if reusable and sku_safe(reusable["sku"]) != sku_safe(item["sku"]):
            ext = reusable["original_path"].rsplit(".", 1)[-1]
            paths = self.paths(item["sku"], sha, ext, bool(reusable["master_jpg_path"]))
            self.storage.copy(BUCKET_ORIGINALS, reusable["original_path"], paths["original"])
            if reusable["master_jpg_path"]:
                self.storage.copy(BUCKET_ORIGINALS, reusable["master_jpg_path"], paths["master"])
            variant_paths = {}
            for size, info in reusable["variant_paths"].items():
                self.storage.copy(BUCKET_IMAGES, info["path"], paths["variants"][size])
                variant_paths[size] = {**info, "path": paths["variants"][size]}
            meta = {**reusable, "original_path": paths["original"], "master_jpg_path": paths["master"]}
            self._upsert_row(item, sha, meta, variant_paths, existing_id=existing_id)
            self.counts.reused += 1
            return "reused"
        if reusable:  # same SKU, different kind: objects already exist under this prefix
            meta = dict(reusable)
            self._upsert_row(item, sha, meta, reusable["variant_paths"], existing_id=existing_id)
            self.counts.reused += 1
            return "reused"

        try:
            p = process_image(data)
        except SkippedFile as e:
            self._issue("image_skipped", str(e), item)
            with self.db.conn.cursor() as cur:
                cur.execute(
                    """
                    insert into mirror.catalogue_image_skips (airtable_record_id, kind, airtable_attachment_id, sku, filename, reason)
                    values (%s, %s, %s, %s, %s, %s)
                    on conflict (airtable_record_id, kind, airtable_attachment_id) do update set reason = excluded.reason, last_seen = now()
                    """,
                    (item["record_id"], item["kind"], item["att_id"], item["sku"], item.get("filename"), str(e)),
                )
            self.db.commit()
            self.counts.skipped += 1
            return "skipped"

        paths = self.paths(item["sku"], sha, p.ext, p.master_jpg is not None)
        self._upload_all(item, p, paths, data)
        variant_paths = {str(s): {"path": paths["variants"][str(s)], "w": w, "h": h} for s, (_b, w, h) in p.variants.items()}
        largest = p.variants[VARIANT_SIZES[-1]]
        meta = {
            "original_path": paths["original"], "original_mime": p.mime, "original_bytes": len(data),
            "original_width": p.width, "original_height": p.height, "master_jpg_path": paths["master"],
            "low_res": p.low_res, "width": largest[1], "height": largest[2], "blurhash": p.blurhash,
        }
        self._upsert_row(item, sha, meta, variant_paths, existing_id=existing_id)
        self.counts.processed += 1
        return "processed"

    # ---- entry points ----------------------------------------------------------------------------------
    def run(self, batch: int) -> ImageCounts:
        self.soft_delete_removed()
        for item in self.pending(batch):
            try:
                self.process_item(item)
            except Exception as e:  # one bad file never stops the batch
                self.db.rollback()
                self._issue("image_failed", f"{type(e).__name__}: {e}", item)
                self.db.commit()
                self.counts.failed += 1
        return self.counts

    def purge(self, days: int) -> int:
        """Delete Storage variants of rows soft-deleted more than `days` ago. Originals are never deleted."""
        with self.db.conn.cursor() as cur:
            cur.execute(
                """
                select i.id, i.variant_paths,
                       exists (select 1 from mirror.catalogue_images o
                                where o.id <> i.id and o.deleted_at is null and o.variants_purged_at is null
                                  and o.source_hash = i.source_hash and o.encoder_version = i.encoder_version
                                  and o.sku = i.sku) as shared
                  from mirror.catalogue_images i
                 where i.deleted_at is not null and i.deleted_at < now() - make_interval(days => %s)
                   and i.variants_purged_at is null
                """,
                (days,),
            )
            rows = cur.fetchall()
        n = 0
        for row_id, variant_paths, shared in rows:
            if not shared:
                self.storage.remove(BUCKET_IMAGES, [v["path"] for v in variant_paths.values()])
            with self.db.conn.cursor() as cur:
                cur.execute(
                    "update mirror.catalogue_images set variants_purged_at = now(), orphaned_at = coalesce(orphaned_at, now()) where id = %s",
                    (row_id,),
                )
            self.db.commit()
            n += 1
        self.counts.purged = n
        return n
