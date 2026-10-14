# titan-desk — rules for agents and humans

titan-desk is a **read-only mirror** of the Bert Airtable base for Titan Flooring staff.
Data flows one way: Airtable → Postgres (Supabase) → this app. Nothing here imports code
from `titan-agents`.

**Apps in this repo** — one repo, one deployment per audience (Albert, 2026-10-11):

| Folder | App | Who | Writes to Airtable |
|---|---|---|---|
| `web/` | the desk: catalogue search, staff askBert | staff (Microsoft sign-in) | never |
| `quote/` | quoting | named quoters only (`QUOTE_ALLOWED_EMAILS`) | quote tables only, from one file — see `quote/CLAUDE.md` |
| (later) | public askBert on the website | anyone | never; its own deployment holding no write secret |

Each app is its own Vercel project with its own secrets. A public app never shares a
deployment with a write token.

## Hard rules

1. **Never write to Airtable — outside `quote/`.** The sync worker's PAT is created
   read-only (`data.records:read` + `schema.bases:read`). Do not add write scopes, and do
   not add code paths that call Airtable create/update/delete endpoints in `web/`, `sync/`
   or `db/`. The single exception (Albert, 2026-10-11) is `quote/src/lib/airtable/client.ts`,
   which may write to the four quote tables only, with its own token, under `quote/CLAUDE.md`
   and its boundary test. Its first writes (creating a quote and its version 1) shipped 2026-10-14.
2. **The web app reads views only.** `web/src/lib/db/queries.ts` is the only place that
   talks to the database, and it knows exactly these objects in schema `api`:
   `catalogue_staff`, `search_staff`, `search_staff_grouped`, `catalogue_facets`, `catalogue_browse`, `sync_status`, `design_dictionary`,
   `design_rules`, and an INSERT
   into `search_log`. Never query schema `mirror` from the app.
   The askBert assistant (`web/agents/askbert`) has one read-only tool that calls
   `api.askbert_search` / `api.askbert_relax` through PostgREST with the signed-in staff
   member's own session (never a service key, never a separate login). Staff see all data,
   cost included, by decision (2026-09-28); never expose these functions to anon, never add a
   write tool, and never build SQL text from model input.
3. **The public/staff boundary lives in the database.** Adding a column to a view is a
   security decision: update the tier table in `db/README.md`, the view, and tests
   `006_view_columns.sql` + `007_tier_allowlist.sql` together.
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
- `quote/` — the quoting app (Next.js 16), its own Vercel project. Rules: `quote/CLAUDE.md`.
- `platform-settings/` — Airtable base/table/field IDs.
- `.claude/skills/` — vendored design skills for UI work (taste-skill plus 74 DESIGN.md
  references). For any screen or component work in `web/` or `quote/`, load
  `design-taste-frontend` (new) or `redesign-existing-projects` (existing) and pick one to
  three references from `design-md-references`. Borrow structure, never another brand.
  Index and update notes: `.claude/skills/README.md`.
- `.github/workflows/` — CI, scheduled syncs, migrations, schema-drift check.

## Local commands

```
make db-start      # local Postgres harness (or `supabase --workdir db start` when available)
make db-reset      # apply migration + seed
make db-test       # pgTAP tests
make sync-test     # pytest for the worker
make web-dev       # next dev (needs npm access)
```
