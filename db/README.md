# Database

Supabase project for titan-desk. Run the CLI from the repo root: `supabase --workdir db <cmd>`.
Without the CLI/Docker, `db/scripts/local-pg.sh {start,reset,test}` applies the same migration
and tests to a plain Postgres 16 (with `scripts/supabase_shim.sql` standing in for Supabase's
roles/schemas and `scripts/pgtap_shim.sql` for the pgTAP subset the tests use).

## Schemas

| Schema | Exposed by the Data API | Holds |
|---|---|---|
| `mirror` | **no** | `catalogue` (every Airtable field), `catalogue_images`, `catalogue_image_skips`, `catalogue_stage`, `sync_runs`, `sync_issues`, `sync_state`, `settings`, helper functions |
| `api` | **yes, the only one** | `catalogue_public`, `catalogue_staff`, `catalogue_facets`, `sync_status`, `design_dictionary`, `design_rules`, `search_public()`, `search_staff()`, `parse_query()`, `today()`, `search_log` |

`public` is removed from the exposed schemas (dashboard → API settings; `config.toml` locally).
Why a separate `api` schema: grants are explicit and enumerable (test 001 lists every EXECUTE),
and the schema can be removed from the API entirely. Postgres grants EXECUTE on every new
function to PUBLIC by default and a per-schema `ALTER DEFAULT PRIVILEGES … REVOKE` cannot undo
that built-in default, so migration 001 revokes it per function (§12) and **any new function in
`api`/`mirror` needs the same explicit REVOKE** — test 001 fails otherwise.

## Roles

| Role | Gets |
|---|---|
| `anon` (public, website agent) | SELECT `api.catalogue_public`; EXECUTE `api.search_public`, `api.parse_query`, `api.today`; USAGE on `mirror` + EXECUTE on its pure helpers (`price_unit`, `variant_label`, `image_url`, `is_public`) because the views call them as the caller; no privilege on any `mirror` table; `statement_timeout = 3s` |
| `authenticated` (staff, M365) | the above (incl. the `mirror` helper access) + SELECT `catalogue_staff`, `catalogue_facets`, `sync_status`, `design_dictionary`, `design_rules`; EXECUTE `search_staff`; INSERT `search_log` (own uid only; no SELECT) |
| `sync_worker` (Python worker) | USAGE on `mirror`; SELECT/INSERT/UPDATE/DELETE on its tables; TRUNCATE on the stage. Created NOLOGIN; Albert runs `alter role sync_worker login password '…'` once in the SQL editor |
| `supabase_auth_admin` | EXECUTE `mirror.hook_restrict_signup` (Before User Created hook) |

## Tier table — the source of truth for the views and tests 006/007

**Public** (in `api.catalogue_public`, therefore also in `catalogue_staff`):
`sku, product_name, brand, collection, product_type, category, material_type, species, colour_tone, grade, layout_pattern, width_in, length, thickness_mm, wear_layer_mil, veneer_mm, veneer_cut_type, ac_rating, finish_type, install_profile, install_method, locking_system, underpad_included, underpad_type, iic_rating, stc_rating, tile_format, weight_per_piece_kg, certifications, retail_price, price_on_request, price_unit, promo_active, box_size_sf, pieces_per_box, stock_status, coming_soon, waterproof, pet_friendly, radiant_heat_compatible, traffic_rating, suitable_rooms, residential_warranty_yrs, commercial_warranty_yrs, undertone, tone_depth, texture, style, busyness, pairs_well_with, variants, images, hero, search_public`

**Staff only** (added in `api.catalogue_staff`):
`supplier, supplier_sku, cost, map_price, pallet_price, promo_cost, promo_end_date, volume_pricing_notes, last_price_update, price_last_changed_by, price_stale, promo_open_ended, boxes_per_skid, pieces_per_pallet, active, salesperson_notes, internal_notes, price_list_url, promo_list_url, rep_cost, rep_cost_end_date, rep_cost_note, rep_cost_active, style_tags_status, style_tags_evidence, airtable_url, search_staff` (+ `low_res` inside `images`/`hero`)

**System only** (base table, in neither view):
`airtable_record_id, airtable_created_at, airtable_modified_at, synced_at, lightspeed_id, ls_handle, variant_group, image_attachments`

**Not mirrored:** Airtable `Attachments`, `Attachment Summary`, `Price History Log` (legacy), `Price History Log v2`.

What the boundary does and does not protect: cost, MAP, pallet/promo pricing, notes, supplier
SKUs and Lightspeed ids never leave the staff tier. **Supplier identity is derivable from
public data** (SKU format `CAT-SUPP-####`, Olympia/Biyork/Floordi/Triforest SKUs embed the
supplier code, brand often equals supplier). The tier protects pricing, not who supplies what.

## Business rules encoded in the views

| Rule | Implementation |
|---|---|
| Public row filter | `active AND stock_status IS DISTINCT FROM 'Discontinued'` (`mirror.is_public`) — Clearance stays public |
| Public `retail_price` | raw retail, `0 → NULL`; **no MAP floor** (decision 2026-09-26; MAP is staff-only) |
| `price_on_request` | retail NULL or 0 (STONE pieces by rule, oak treads awaiting markup) |
| `price_unit` | `piece` when `category = 'STONE'` or `product_type <> 'Flooring'`, else `sf` (heuristic; edit `mirror.price_unit`) |
| `promo_active` | strict: `promo_cost IS NOT NULL AND promo_end_date >= today` (Toronto); NULL end date → false; staff see `promo_open_ended` |
| `rep_cost_active` | staff only: `rep_cost IS NOT NULL AND (rep_cost_end_date IS NULL OR rep_cost_end_date >= today)`; NULL end date = ongoing (the opposite of promos, per the Airtable field description) |
| `price_stale` | `last_price_update IS NULL OR < today − 90` |
| `coming_soon` | `salesperson_notes` starts with "COMING SOON" (boolean only; notes stay staff-only) |
| `variants` | rows sharing `upper(ls_handle)`, self excluded; public view only shows public siblings; `variant_label` = grade, else size, else finish, else name |
| `pairs_well_with` | raw text split on `, ; newline`, joined on `sku`; unknown SKUs dropped; public view drops hidden targets |
| `images` / `hero` | non-deleted index rows ordered swatch → room → detail; URLs fully formed with `?v=encoder_version`; hero = first swatch, else first room scene; originals/master paths never exposed |
| `today()` | `(now() AT TIME ZONE 'America/Toronto')::date`, STABLE, granted to anon/authenticated |

## Search

`api.parse_query(q)` turns "6in click on promo under $4" into filters (width ±0.25", thickness
±0.5 mm, install profile, promo/clearance, waterproof/pet/radiant, category words, price bounds)
plus free text. Style words (light, warm, brushed, modern …) are **not** stripped: they match the
weight-D search segment (install/underpad/finish/width/thickness labels, category synonyms,
design fields, tone-depth words), which degrades gracefully while the design fields are sparse.

`search_staff` / `search_public`: two stages (rank + page on light columns, then join back for
the card projection). Predicates are all indexable — `@@` on the tsvector GIN, `<%`
(word similarity, threshold 0.45 set on the database and the API roles) on the product-name
trigram GIN, `ILIKE` on the SKU trigram GIN — so the planner uses a BitmapOr. Both functions are
`LANGUAGE sql STABLE`, no `STRICT`, no `SET search_path`, schema-qualified names: keep them that
way or they stop inlining. `lim` is capped at 50.

## Accepted advisor warnings

- **security_definer_view** on `api.catalogue_public` / `catalogue_staff`: intended. The views
  run with the owner's privileges so API roles never need grants on `mirror`. `security_barrier`
  is off because it blocks pushing `@@`/`<%`/`ILIKE` into the indexes; the only rows the public
  view hides are inactive/discontinued products whose columns are all public-tier anyway.
- **function_search_path_mutable** on `api.search_*`, `api.parse_query`, `api.today`, and the
  `mirror` helpers: adding `SET search_path` disables inlining. Names are schema-qualified instead.

## Dashboard queries (SQL editor)

```sql
-- issues from the latest run
select kind, count(*) from mirror.sync_issues where run_id = (select max(id) from mirror.sync_runs) group by 1 order by 2 desc;

-- promos with no end date (should be 0 after the July 2026 rule is applied everywhere)
select sku, product_name, promo_cost from mirror.catalogue where promo_cost is not null and promo_end_date is null;

-- MAP above retail (informational; MAP is not enforced)
select sku, supplier, retail_price, map_price from mirror.catalogue where map_price > retail_price order by supplier;

-- stale prices
select supplier, count(*) from api.catalogue_staff where price_stale group by 1 order by 2 desc;

-- coming soon
select sku, product_name from api.catalogue_staff where coming_soon;

-- products with no swatch photo (the "Needs swatch" to-do list)
select sku, product_name from api.catalogue_staff where active and hero is null;

-- orphaned originals by size (kept on purpose; review occasionally)
select count(*), pg_size_pretty(sum(original_bytes)) from mirror.catalogue_images where orphaned_at is not null;

-- storage footprint (the "when to upgrade" number: Supabase Free caps Storage at 1 GB)
select count(*) images, pg_size_pretty(sum(original_bytes)) originals from mirror.catalogue_images where deleted_at is null;

-- search latency p95 (client-measured)
select percentile_cont(0.95) within group (order by took_ms) from api.search_log where created_at > now() - interval '7 days';
```

## Design Dictionary + Design Rules (migration 002)

Two small Airtable tables Albert edits by hand, mirrored whole on every sync run
(`sync/titan_sync/design.py`; a fetch that returns nothing never wipes the copy). Staff-only
for now — the public website agent gets its own view when it is built.

| View | Rows | Columns withheld |
|---|---|---|
| `api.design_dictionary` | active phrases only | `notes` (internal) |
| `api.design_rules` | active Design rules **plus every Safety rule, whatever its Active box says** | `notes`, `active` |

Safety rules are enforced in code (`web/src/lib/design/safety.ts`, same keys as the table) and
never relaxed. An unticked Waterproof / Radiant box or a blank IIC counts as *not confirmed*:
the floor is held out of the picks and the page says how many were held back. Test: 009.

## Adding a column

1. New migration: add the column to `mirror.catalogue` (and to the views if it has a tier).
2. `platform-settings/airtable.json` + `sync/titan_sync/fields.py` (kind, tier) + `sync/schema_snapshot.json`.
3. Tests `006_view_columns.sql` (exact lists) and `007_tier_allowlist.sql` (tier lists) and this README.
4. `web/src/lib/db/types.ts`.

## Runbook bits

- **Rotate the sync password**: `alter role sync_worker login password '…'`; update the `DATABASE_URL` secret.
- **Sign-up domain list**: `update mirror.settings set value = 'titanflooring.ca' where key = 'allowed_email_domains'` (empty = not enforced here; the Azure tenant pin still applies).
- **Airtable link constants**: `mirror.settings` keys `airtable_base_id`, `airtable_table_id` feed `airtable_url`.
- **Re-encode images**: bump `ENCODER_VERSION` in `sync/titan_sync/images.py`; URLs change (`?v=`) so caches roll.
- **When to upgrade the Supabase plan**: the project starts on Free (decision 2026-09-26). The
  database stays tens of MB; Storage is what grows, because originals are retained forever.
  Run the "storage footprint" query above (originals + roughly 15% for the WebP variants)
  and move to Pro when the total approaches the Free plan's 1 GB Storage cap, or earlier if
  the sync stops for a week and the project is paused for inactivity.

## 30-minute sync clock (Supabase Cron → app → GitHub)

GitHub's `schedule` trigger is best-effort and on this repo fires every 2–3 hours, not every 30
minutes. A Supabase Cron job is the reliable clock: every 30 minutes it POSTs to the app's
`/api/sync/trigger` with the `x-sync-secret` header; the app (which holds `GITHUB_DISPATCH_TOKEN`
in Vercel) fires the `repository_dispatch` that runs `sync-incremental.yml`. The database only
holds `SYNC_TRIGGER_SECRET`, which can start a sync and nothing else; the GitHub token never
leaves Vercel. The GitHub schedule stays as a fallback (the `sync` concurrency group and the
idempotent merge make an extra run harmless). When the Vercel project moves to Pro, replace this
job with a Vercel Cron and `select cron.unschedule('titan-desk-sync');`.

One-time setup (not a migration: the plain-Postgres test harness has no pg_cron/pg_net):

1. Vercel → Settings → Environment Variables: `SYNC_TRIGGER_SECRET` = a long random
   letters-and-digits string; redeploy.
2. Supabase → Database → Extensions: enable `pg_cron` and `pg_net`.
3. SQL editor (same secret value as step 1; replace the app URL if it changes):

```sql
select vault.create_secret('<SYNC_TRIGGER_SECRET value>', 'sync_trigger_secret');

select cron.schedule(
  'titan-desk-sync',
  '*/30 * * * *',
  $job$
  select net.http_post(
    url     := 'https://titan-desk-vc.vercel.app/api/sync/trigger',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'x-sync-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'sync_trigger_secret')
    ),
    body    := '{}'::jsonb
  );
  $job$
);
```

Check it: `select status, return_message, start_time from cron.job_run_details order by start_time desc limit 5;`
and `select status_code, content from net._http_response order by created desc limit 5;` (202 = queued).
Rotate the secret: `select vault.update_secret((select id from vault.secrets where name = 'sync_trigger_secret'), '<new>');`
and update the Vercel variable to match.
