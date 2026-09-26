# titan-desk

Staff-facing catalogue lookup for Titan Flooring: a read-only Postgres mirror of the Bert
Airtable base on Supabase, a Python sync worker on GitHub Actions, and a Next.js PWA.

```
Airtable (source of truth)  ──sync every 30 min / nightly full──▶  Supabase Postgres
                                                                     ├─ mirror.*  (private)
                                                                     └─ api.*     (views + RPC, the only exposed schema)
                                                                            │
                                            staff phones (Next.js PWA, M365 sign-in) ◀┘
                                            website agent (later, anon, public view only)
```

- **Speed:** search hits `api.search_staff` (full-text + word-trigram, GIN-indexed) straight
  from the phone; target p95 < 200 ms.
- **Boundary:** the public/staff split is enforced by view grants in the database. Cost,
  MAP, supplier, notes never leave the staff tier. See `db/README.md` for the tier table.
- **Images:** Airtable holds which photos belong to a SKU; Supabase Storage holds WebP
  variants (public, CDN) and untouched originals (private); Postgres holds the index.
- **One-way:** nothing here writes to Airtable. The worker's token is read-only.

## Repo map

| Path | What |
|---|---|
| `db/` | Supabase project: migration 001, seed, pgTAP tests, local-Postgres harness |
| `sync/` | Python worker: `--mode incremental \| full \| images \| purge \| report` |
| `web/` | Next.js 16 App Router PWA |
| `platform-settings/airtable.json` | Airtable base/table/field IDs (not secrets) |
| `.github/workflows/` | CI, scheduled syncs, migrations, schema drift |

## Getting started

```
make db-start && make db-reset && make db-test   # database + tests
make sync-test                                    # worker tests
make web-install && make web-dev                  # app (needs npm access)
```

Environment variable names are in `.env.example`. Values live in GitHub Actions secrets and
Vercel env, never in the repo.

## Hosting

- **Supabase Free** to start (`ca-central-1`; only the `api` schema exposed). The mirror is
  tens of MB and rebuildable from Airtable, the 30-minute sync keeps the project from being
  paused for inactivity, and backups are unnecessary for a mirror.
- **Upgrade to Pro when image storage grows.** Originals are kept forever in the private
  `catalogue-originals` bucket, so the Free plan's 1 GB storage cap is the trigger (roughly
  300–500 photos with originals). The "storage footprint" query in `db/README.md` is the
  number to watch; upgrade when it approaches 1 GB.
- **Vercel** project rooted at `web/`, function region `yul1` (Montréal).

## Runbook

See `db/README.md` (grants, accepted advisor warnings, dashboard queries) and
`sync/README.md` (what each mode does, failure modes, how to rotate credentials).

**Sync failed** → open the Actions run; the `report` step summarises issues. Re-run with
"Run workflow". Header stamp in the app turns red when the last success is older than 2 h.

**Actions minutes exhausted / scheduled workflow disabled** → runs stop silently. The red
header stamp is the signal. Check Billing → Actions budget, then Actions → the workflow →
"Enable workflow".

**New Airtable field** → the weekly drift job opens an issue. Add the field ID to
`platform-settings/airtable.json`, map it in `sync/titan_sync/fields.py` with a tier, add the
column in a new migration and to the tier table in `db/README.md`, update tests 006/007.

**Rotate the sync DB password** → Supabase SQL editor: `alter role sync_worker login password
'…'`; update the `DATABASE_URL` secret.

**Rotate the Airtable PAT** → create a new PAT with only `data.records:read` and
`schema.bases:read` on the Bert base; update `AIRTABLE_TOKEN`.

**Re-encode images** (new WebP quality, AVIF) → bump `ENCODER_VERSION` in
`sync/titan_sync/images.py` and run `--mode images --reencode`; URLs carry `?v=` so caches roll.
