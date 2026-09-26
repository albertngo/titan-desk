# titan-sync

One-way mirror: Airtable "Master Flooring Catalogue" → `mirror.catalogue` on Supabase, plus
the image pipeline into Supabase Storage. Read-only against Airtable, always.

```
python -m titan_sync.run --mode incremental   # every 30 min: records modified since the watermark (−10 min overlap)
python -m titan_sync.run --mode full          # nightly: everything, then delete rows gone from Airtable (guarded)
python -m titan_sync.run --mode images        # drain new/changed attachments (300 per run by default)
python -m titan_sync.run --mode purge         # delete WebP variants of images removed ≥30 days ago (originals kept)
python -m titan_sync.run --mode report        # markdown summary of the latest run(s) for $GITHUB_STEP_SUMMARY
python -m titan_sync.schema_snapshot --check  # compare the live Airtable schema to schema_snapshot.json
```

## How a record flows

1. `airtable.py` fetches pages with `use_field_ids=True` (names are never trusted) and, for
   incremental runs, `IS_AFTER(LAST_MODIFIED_TIME(), <watermark − 10 min>)`.
2. `transform.record_to_row` maps every field by ID through `fields.py` → `coerce.py`.
   Bad values become NULL plus a `sync_issues` row; the run never stops for data.
3. `db.stage_and_merge`: TRUNCATE + COPY into `mirror.catalogue_stage`, validate in SQL
   (blank SKU, duplicate SKU within the batch or against another record), then
   `INSERT … ON CONFLICT (airtable_record_id) DO UPDATE … WHERE excluded.airtable_modified_at >= existing`.
   One transaction per run: readers never see a half-applied sync.
4. Full runs only: rows absent from the fetch are deleted (their image rows soft-deleted
   first). Guard: if the fetch returned < 90 % of the mirror or < 1,000 rows, nothing is
   deleted, the run is marked `guard_tripped`, and the job fails loudly.
5. The watermark stored is the run's **start** time, so records edited mid-run are re-fetched
   next time; the merge condition makes that idempotent.

Until the computed `Last modified` field exists in Airtable, `airtable_modified_at` is the
sync time (still monotonic across runs). Add the field, put its ID in
`platform-settings/airtable.json` → `last_modified`, and the true value is used.

## Images

Three Airtable attachment fields (`Swatch images`, `Room scene images`, `Detail images`) are
stored raw in `mirror.catalogue.image_attachments` (system column). `--mode images` diffs that
against `mirror.catalogue_images`:

- new attachment id → download (URL refreshed from Airtable on 403/410), sha256,
  then one of: undelete (same id or same bytes seen before for this record), server-side copy
  (same bytes live under another SKU), or process + upload
- processing: exif_transpose → sRGB via embedded ICC → flatten on white → strip metadata →
  200/600/1600 WebP q80 m6 (never upscaled; `low_res` when long edge < 1600) → blurhash from
  the 200 px; HEIC/HEIF also get a full-res JPEG master (q92) in the originals bucket
- accepted: JPEG, PNG, WebP, HEIC/HEIF, TIFF. Anything else is recorded in
  `catalogue_image_skips` (once per attachment id) and in the run report; never fatal
- removed in Airtable → `deleted_at`; `--mode purge` deletes the **variants** after 30 days;
  originals and masters are never deleted (rows get `orphaned_at`)
- Storage keys: `catalogue-originals/{sku}/{sha256}.{ext}` (+ `_master.jpg`),
  `catalogue-images/{sku}/{sha256}_{200|600|1600}.webp`; URLs in the views carry
  `?v=<encoder_version>`; bump `ENCODER_VERSION` in `images.py` to re-encode

## Credentials

| Variable | Scope |
|---|---|
| `AIRTABLE_TOKEN` | PAT with **only** `data.records:read` + `schema.bases:read` on the Bert base |
| `DATABASE_URL` | `sync_worker` role via the Supavisor session pooler (`sync_worker.<ref>`) |
| `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` | Storage uploads/copies/deletes only |

Rotate the DB password with `alter role sync_worker login password '…'` in the SQL editor.

## Failure modes

- **`guard_tripped`**: Airtable returned far fewer rows than the mirror holds (outage, wrong
  base, truncated fetch). Nothing was deleted. Check the run's `error`, re-run when Airtable
  is healthy.
- **`unmapped_field` issue**: a new Airtable field exists. Add it to `platform-settings/airtable.json`
  and `fields.py` with a tier (or `SKIP`), add the column in a new migration, update the
  tier tests, refresh `schema_snapshot.json` with `--write`.
- **`image_failed`**: download failed even after a URL refresh; retried on the next run.
- **429 from Airtable**: pyairtable retries with backoff; sustained 429s mean another client
  is burning the base's 5 rps. `api_calls` per run is in `sync_runs`.

## Tests

`pytest` runs unit tests always and the database/image round-trip tests when a database with
migration 001 is reachable (`DATABASE_URL`, or the local harness at
`postgresql://sync_worker:sync_worker@127.0.0.1:5432/titan_desk_test`). Image fixtures are
generated with Pillow at test time (alpha PNG, EXIF-rotated JPEG, CMYK JPEG, 800 px JPEG,
HEIC, animated GIF, a PDF and an MP4 header), so the repo carries no binaries.
