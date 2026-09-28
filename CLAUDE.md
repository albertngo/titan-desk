# titan-desk — rules for agents and humans

titan-desk is a **read-only mirror** of the Bert Airtable base for Titan Flooring staff.
Data flows one way: Airtable → Postgres (Supabase) → this app. Nothing here ever writes to
Airtable, and nothing here imports code from `titan-agents`.

## Hard rules

1. **Never write to Airtable.** The sync worker's PAT is created read-only
   (`data.records:read` + `schema.bases:read`). Do not add write scopes, and do not add
   code paths that call Airtable create/update/delete endpoints.
2. **The web app reads views only.** `web/src/lib/db/queries.ts` is the only place that
   talks to the database, and it knows exactly these objects in schema `api`:
   `catalogue_staff`, `search_staff`, `search_staff_grouped`, `catalogue_facets`, `sync_status`, `design_dictionary`,
   `design_rules`, and an INSERT
   into `search_log`. Never query schema `mirror` from the app.
   The one other database path is the askBert assistant's tool: `web/agents/askbert/agent/lib/db.ts`
   connects as role `askbert_reader` (`ASKBERT_DATABASE_URL`) and reads only the view
   `askbert.catalogue`, which has no cost, margin or internal pricing. Never give that role
   another grant, never add a write tool, and never build SQL text from model input.
3. **The public/staff boundary lives in the database.** Adding a column to a view is a
   security decision: update the tier table in `db/README.md`, the view, and tests
   `006_view_columns.sql` + `007_tier_allowlist.sql` together (for `askbert.catalogue`,
   the askBert tier in `db/README.md` and `010_askbert.sql`).
4. **No secrets in the repo.** `.env.example` lists variable names only.
   `platform-settings/airtable.json` holds Airtable IDs (not secrets) and is the single
   source for field IDs used by `sync/titan_sync/fields.py`.
5. **Migrations are append-only.** Never edit a migration that has been applied to prod;
   add a new one.
6. **Never chain `.select()` on the `search_log` insert.** There is no SELECT grant;
   supabase-js defaults to `return=minimal`.
7. **Search functions stay inlinable.** No `STRICT`, no `SET search_path`, single SELECT,
   schema-qualified names (`extensions.word_similarity`, `OPERATOR(extensions.<%)`).

## Layout

- `db/` — Supabase project (`supabase --workdir db`): migrations, seed, pgTAP tests.
  `db/scripts/local-pg.sh` runs the same migration and tests on a plain Postgres 16 with
  role/extension shims when the Supabase CLI is unavailable.
- `sync/` — Python worker (`python -m titan_sync.run --mode incremental|full|images|purge`).
- `web/` — Next.js 16 App Router PWA. `web/src/lib/design/` is the Help me choose logic (pure,
  tested in `web/tests/design.test.ts`); safety rules there are fixed in code and never relaxed.
- `platform-settings/` — Airtable base/table/field IDs.
- `.github/workflows/` — CI, scheduled syncs, migrations, schema-drift check.

## Local commands

```
make db-start      # local Postgres harness (or `supabase --workdir db start` when available)
make db-reset      # apply migration + seed
make db-test       # pgTAP tests
make sync-test     # pytest for the worker
make web-dev       # next dev (needs npm access)
```
