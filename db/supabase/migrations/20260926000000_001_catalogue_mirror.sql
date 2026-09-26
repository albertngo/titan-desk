-- =============================================================================
-- titan-desk — migration 001: catalogue mirror
--
-- Schemas
--   mirror  private. Base table (every Airtable field), images index, stage table,
--           sync bookkeeping, settings, helper functions. Never exposed by the API.
--   api     the ONLY schema exposed by PostgREST. Views carry the public/staff
--           boundary; grants are explicit and enumerable (see db/README.md).
--
-- Roles
--   anon           public / website agent   → api.catalogue_public, api.search_public
--   authenticated  staff (M365 sign-in)     → + api.catalogue_staff, search_staff, facets,
--                                              sync_status, INSERT api.search_log
--   sync_worker    the Python worker        → read/write mirror.* only
--
-- Design notes are in db/README.md. Business rules (promo_active strict, no MAP floor,
-- price_unit heuristic, coming_soon, hero image) are decisions recorded in the plan.
-- =============================================================================

-- --------------------------------------------------------------------------
-- 0. Extensions and schemas
-- --------------------------------------------------------------------------
create extension if not exists pg_trgm with schema extensions;

create schema if not exists mirror;
create schema if not exists api;

revoke all on schema mirror from public, anon, authenticated;
grant usage on schema api to anon, authenticated, service_role;

-- Postgres grants EXECUTE on every new function to PUBLIC by default, and a per-schema
-- ALTER DEFAULT PRIVILEGES ... REVOKE cannot remove that built-in default (it only reverses
-- per-schema GRANTs). So this migration revokes PUBLIC EXECUTE explicitly on every function
-- it creates (sweep in §12) and test 001 enumerates the EXECUTE matrix. Any future function
-- in api/mirror needs the same explicit REVOKE; the test fails otherwise.

-- The worker's role. Albert sets LOGIN + password once in the SQL editor (never in the repo).
do $do$
begin
  if not exists (select 1 from pg_roles where rolname = 'sync_worker') then
    create role sync_worker nologin;
  end if;
end $do$;
grant usage on schema mirror to sync_worker;

-- Cheap protection for an anon-callable search: no query runs longer than 3 s.
alter role anon set statement_timeout = '3s';

-- Typo tolerance: pg_trgm's word-similarity threshold defaults to 0.6, which a one-letter
-- typo against a long product name does not reach ("macarron" vs "Vidar 7.5\" AWO — Macaroon
-- (Character)" scores 0.56). 0.45 keeps the indexable <% operator and catches such typos.
-- PostgREST applies role-level settings per request; the database-level setting covers
-- direct sessions (tests, psql) and is skipped with a notice where the role cannot ALTER DATABASE.
alter role anon set pg_trgm.word_similarity_threshold = 0.45;
alter role authenticated set pg_trgm.word_similarity_threshold = 0.45;
do $do$
begin
  execute format('alter database %I set pg_trgm.word_similarity_threshold = 0.45', current_database());
exception when insufficient_privilege then
  raise notice 'could not ALTER DATABASE %; role-level thresholds still apply through PostgREST', current_database();
end $do$;

-- --------------------------------------------------------------------------
-- 1. Settings
-- --------------------------------------------------------------------------
create table mirror.settings (
  key        text primary key,
  value      text not null default '',
  updated_at timestamptz not null default now()
);
comment on table mirror.settings is 'Key/value configuration read by views and the auth hook.';

insert into mirror.settings (key, value) values
  ('allowed_email_domains', ''),               -- comma-separated; empty = not enforced here (Azure tenant pin still applies)
  ('airtable_base_id',      'appWHOVZ0QCS0xQ3M'),
  ('airtable_table_id',     'tblfLXD3zkSdNQGbS');

-- --------------------------------------------------------------------------
-- 2. Helper functions (mirror.*) — IMMUTABLE where used by generated columns
-- --------------------------------------------------------------------------

-- "6.00" -> "6", "7.50" -> "7.5", "100.00" -> "100"
create function mirror.num_label(x numeric) returns text
language sql immutable parallel safe as $fn$
  select case
    when x is null then null
    when x = trunc(x) then trunc(x)::text
    else rtrim(rtrim(x::text, '0'), '.')
  end
$fn$;

-- Words that make plain searches find categories/materials by everyday names.
create function mirror.category_synonyms(category text, material_type text) returns text
language sql immutable parallel safe as $fn$
  select concat_ws(' ',
    case category
      when 'LVP' then 'vinyl plank lvp'
      when 'LVT' then 'vinyl tile lvt'
      when 'Engineered hardwood' then 'engineered hardwood wood'
      when 'Solid hardwood' then 'solid hardwood wood'
      when 'Laminate' then 'laminate'
      when 'Tile / Stone' then 'tile porcelain ceramic stone'
      when 'STONE' then 'stone marble quartz threshold'
      when 'Carpet' then 'carpet'
      when 'Accessory' then 'accessory trim'
      else ''
    end,
    case
      when material_type ilike 'SPC%' then 'spc vinyl rigid'
      when material_type ilike 'WPC%' then 'wpc vinyl'
      when material_type ilike '%vinyl%' then 'vinyl'
      else ''
    end)
$fn$;

-- One weighted tsvector for both search columns (search_staff appends supplier fields).
create function mirror.build_search(
  product_name text, sku text, brand text, collection text,
  category text, material_type text, species text, colour_tone text, grade text,
  install_profile text, install_method text, locking_system text, underpad_type text,
  width_in numeric, thickness_mm numeric, finish_type text,
  undertone text, tone_depth smallint, texture text, style text[], busyness text
) returns tsvector
language sql immutable parallel safe as $fn$
  select
    setweight(to_tsvector('simple', concat_ws(' ', product_name, sku)), 'A') ||
    setweight(to_tsvector('simple', concat_ws(' ', brand, collection)), 'B') ||
    setweight(to_tsvector('simple', concat_ws(' ', category, material_type, species, colour_tone, grade)), 'C') ||
    setweight(to_tsvector('simple', concat_ws(' ',
      install_profile, install_method, locking_system, underpad_type, finish_type,
      case when width_in is not null then mirror.num_label(width_in) || 'in ' || mirror.num_label(width_in) || ' inch' end,
      case when thickness_mm is not null then mirror.num_label(thickness_mm) || 'mm' end,
      mirror.category_synonyms(category, material_type),
      undertone, texture, busyness, array_to_string(style, ' '),
      case tone_depth when 1 then 'very light' when 2 then 'light' when 3 then 'medium' when 4 then 'dark' when 5 then 'very dark' end
    )), 'D')
$fn$;

-- The public row filter, in exactly one place.
create function mirror.is_public(active boolean, stock_status text) returns boolean
language sql immutable parallel safe as $fn$
  select coalesce(active, false) and stock_status is distinct from 'Discontinued'
$fn$;

-- Per-sqft for flooring; per piece for accessories, mouldings, STONE pieces.
create function mirror.price_unit(product_type text, category text) returns text
language sql immutable parallel safe as $fn$
  select case
    when category = 'STONE' then 'piece'
    when product_type is not null and product_type <> 'Flooring' then 'piece'
    else 'sf'
  end
$fn$;

-- Chip label for a sibling in a variant group: grade, else size/finish, else the name.
create function mirror.variant_label(grade text, width_in numeric, length text, finish_type text, product_name text) returns text
language sql immutable parallel safe as $fn$
  select coalesce(
    nullif(grade, ''),
    nullif(concat_ws(' × ', case when width_in is not null then mirror.num_label(width_in) || '"' end, nullif(length, '')), ''),
    nullif(finish_type, ''),
    product_name)
$fn$;

-- Domain allow-list check used by the auth hook and the fallback trigger.
create function mirror.email_domain_allowed(email text) returns boolean
language sql stable security definer set search_path = '' as $fn$
  select coalesce(
    (select value = '' or lower(split_part(email, '@', 2)) = any (string_to_array(lower(replace(value, ' ', '')), ','))
       from mirror.settings where key = 'allowed_email_domains'),
    true)
$fn$;

-- --------------------------------------------------------------------------
-- 3. Base table: mirror.catalogue (every Airtable field + system columns)
-- --------------------------------------------------------------------------
create table mirror.catalogue (
  -- system
  airtable_record_id   text primary key,
  airtable_created_at  timestamptz,
  airtable_modified_at timestamptz not null,
  synced_at            timestamptz not null default now(),

  -- identity
  sku                  text not null,
  product_name         text,
  brand                text,
  supplier             text,
  supplier_sku         text,
  lightspeed_id        text,
  ls_handle            text,
  collection           text,
  product_type         text,
  category             text,
  material_type        text,
  species              text,
  colour_tone          text,
  grade                text,
  layout_pattern       text,

  -- specs
  width_in             numeric(8,2),
  length               text,
  thickness_mm         numeric(6,1),
  wear_layer_mil       numeric(6,1),
  veneer_mm            numeric(5,2),
  veneer_cut_type      text,
  ac_rating            text,
  finish_type          text,
  install_profile      text,
  install_method       text,
  locking_system       text,
  underpad_included    boolean not null default false,
  underpad_type        text,
  iic_rating           numeric(5,1),
  stc_rating           numeric(5,1),
  tile_format          text,
  weight_per_piece_kg  numeric(8,3),
  certifications       text[] not null default '{}',

  -- pricing (staff tier)
  cost                 numeric(10,2),
  retail_price         numeric(10,2),
  map_price            numeric(10,2),
  pallet_price         numeric(10,2),
  promo_cost           numeric(10,2),
  promo_end_date       date,
  volume_pricing_notes text,
  last_price_update    date,                 -- Airtable "Effective Date"
  price_last_changed_by text,

  -- packaging
  box_size_sf          numeric(8,2),
  pieces_per_box       numeric(8,2),
  boxes_per_skid       numeric(8,2),
  pieces_per_pallet    numeric(8,2),
  stock_status         text,
  active               boolean not null default false,

  -- suitability
  waterproof           boolean not null default false,
  pet_friendly         boolean not null default false,
  radiant_heat_compatible boolean not null default false,
  traffic_rating       text,
  suitable_rooms       text[] not null default '{}',

  -- warranty
  residential_warranty_yrs numeric(5,1),
  commercial_warranty_yrs  numeric(5,1),

  -- knowledge
  salesperson_notes    text,
  pairs_well_with      text,
  internal_notes       text,
  price_list_url       text,

  -- design / style (Airtable fields 58–64)
  undertone            text,
  tone_depth           smallint check (tone_depth between 1 and 5),
  texture              text,
  style                text[] not null default '{}',
  busyness             text,
  style_tags_status    text,
  style_tags_evidence  text,

  -- system: raw attachment metadata from the three image fields, consumed by --mode images
  -- [{"kind": "swatch", "id": "att…", "url": "…", "filename": "…", "type": "image/jpeg", "size": 123}]
  image_attachments    jsonb not null default '[]'::jsonb,

  -- derived
  variant_group text generated always as (nullif(upper(ls_handle), '')) stored,
  search_public tsvector generated always as (
    mirror.build_search(product_name, sku, brand, collection, category, material_type, species, colour_tone, grade,
                        install_profile, install_method, locking_system, underpad_type, width_in, thickness_mm, finish_type,
                        undertone, tone_depth, texture, style, busyness)
  ) stored,
  search_staff tsvector generated always as (
    mirror.build_search(product_name, sku, brand, collection, category, material_type, species, colour_tone, grade,
                        install_profile, install_method, locking_system, underpad_type, width_in, thickness_mm, finish_type,
                        undertone, tone_depth, texture, style, busyness)
    || setweight(to_tsvector('simple', coalesce(supplier, '') || ' ' || coalesce(supplier_sku, '')), 'B')
  ) stored,

  constraint catalogue_sku_unique unique (sku)
);
comment on table mirror.catalogue is 'Read-only mirror of Airtable "Master Flooring Catalogue". Written only by sync_worker.';

create index catalogue_search_public_gin on mirror.catalogue using gin (search_public);
create index catalogue_search_staff_gin  on mirror.catalogue using gin (search_staff);
create index catalogue_product_name_trgm on mirror.catalogue using gin (product_name extensions.gin_trgm_ops);
create index catalogue_sku_trgm          on mirror.catalogue using gin (sku extensions.gin_trgm_ops);
create index catalogue_category_idx      on mirror.catalogue (category);
create index catalogue_supplier_idx      on mirror.catalogue (supplier);
create index catalogue_variant_group_idx on mirror.catalogue (variant_group) where variant_group is not null;
create index catalogue_public_idx        on mirror.catalogue (product_name) where active and stock_status is distinct from 'Discontinued';
create index catalogue_modified_idx      on mirror.catalogue (airtable_modified_at);

-- Stage table for the worker's COPY + merge. No generated columns, no constraints.
create unlogged table mirror.catalogue_stage (like mirror.catalogue excluding all);
alter table mirror.catalogue_stage
  drop column variant_group,
  drop column search_public,
  drop column search_staff;

-- --------------------------------------------------------------------------
-- 4. Images index: mirror.catalogue_images
-- --------------------------------------------------------------------------
create table mirror.catalogue_images (
  id                     bigint generated always as identity primary key,
  -- No foreign key on purpose: originals are retained even after the catalogue row is gone.
  airtable_record_id     text not null,
  sku                    text not null,
  kind                   text not null check (kind in ('swatch', 'room', 'detail')),
  airtable_attachment_id text not null,
  sort_order             int  not null default 0,
  source_hash            text not null,           -- sha256 of the original bytes
  original_path          text not null,           -- catalogue-originals/{sku_safe}/{sha256}.{ext}
  original_mime          text not null,
  original_bytes         bigint not null,
  original_width         int,
  original_height        int,
  master_jpg_path        text,                     -- only for HEIC/HEIF sources
  low_res                boolean not null default false,   -- original long edge < 1600
  variant_paths          jsonb not null default '{}'::jsonb, -- {"200": {"path","w","h"}, "600": …, "1600": …}
  width                  int,                      -- of the largest variant
  height                 int,
  blurhash               text,
  encoder_version        int  not null default 1,
  public_base_url        text not null,            -- {SUPABASE_URL}/storage/v1/object/public/catalogue-images
  created_at             timestamptz not null default now(),
  deleted_at             timestamptz,              -- attachment removed in Airtable
  variants_purged_at     timestamptz,              -- variants deleted from Storage (30 days after deleted_at)
  orphaned_at            timestamptz,              -- original retained but unreferenced
  constraint catalogue_images_attachment_unique unique (airtable_record_id, kind, airtable_attachment_id),
  constraint catalogue_images_hash_unique       unique (airtable_record_id, kind, source_hash)
);
create index catalogue_images_live_idx on mirror.catalogue_images (airtable_record_id) where deleted_at is null;
create index catalogue_images_hash_idx on mirror.catalogue_images (source_hash);

-- Storage buckets. Public: WebP variants behind the CDN. Private: untouched originals.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('catalogue-images',    'catalogue-images',    true,  26214400, array['image/webp']),
  ('catalogue-originals', 'catalogue-originals', false, 26214400, array['image/jpeg','image/png','image/webp','image/heic','image/heif','image/tiff'])
on conflict (id) do nothing;

-- Full URL of one variant; consumers never compose Storage paths.
create function mirror.image_url(base text, variant_paths jsonb, size text, encoder_version int) returns text
language sql immutable parallel safe as $fn$
  select case when variant_paths ? size
    then base || '/' || (variant_paths -> size ->> 'path') || '?v=' || encoder_version
  end
$fn$;

-- --------------------------------------------------------------------------
-- 5. Sync bookkeeping
-- --------------------------------------------------------------------------
create table mirror.sync_state (
  key        text primary key,
  value      text,
  updated_at timestamptz not null default now()
);

create table mirror.sync_runs (
  id               bigint generated always as identity primary key,
  mode             text not null check (mode in ('incremental', 'full', 'images', 'purge', 'report')),
  trigger          text,
  github_run_id    text,
  started_at       timestamptz not null default now(),
  finished_at      timestamptz,
  status           text not null default 'running' check (status in ('running', 'success', 'failed', 'guard_tripped')),
  fetched          int,
  inserted         int,
  updated          int,
  deleted          int,
  images_processed int,
  images_skipped   int,
  issues           int,
  api_calls        int,
  billed_minutes   numeric(6,2),
  watermark_before timestamptz,
  watermark_after  timestamptz,
  error            text
);
create index sync_runs_started_idx on mirror.sync_runs (started_at desc);

create table mirror.sync_issues (
  id                 bigint generated always as identity primary key,
  run_id             bigint references mirror.sync_runs (id) on delete cascade,
  airtable_record_id text,
  sku                text,
  field              text,
  kind               text not null,   -- e.g. blank_sku, duplicate_sku, bad_select, bad_date, image_skipped, image_failed
  message            text not null,
  created_at         timestamptz not null default now()
);
create index sync_issues_run_idx on mirror.sync_issues (run_id);

-- --------------------------------------------------------------------------
-- 6. Grants on mirror.* for the worker; RLS with a single sync_worker policy
-- --------------------------------------------------------------------------
grant select, insert, update, delete on mirror.catalogue, mirror.catalogue_images,
  mirror.sync_state, mirror.sync_runs, mirror.sync_issues, mirror.settings to sync_worker;
grant select, insert, update, delete, truncate on mirror.catalogue_stage to sync_worker;
grant usage on all sequences in schema mirror to sync_worker;
alter default privileges for role postgres in schema mirror grant usage on sequences to sync_worker;

do $do$
declare t text;
begin
  foreach t in array array['catalogue', 'catalogue_stage', 'catalogue_images', 'sync_state', 'sync_runs', 'sync_issues', 'settings'] loop
    execute format('alter table mirror.%I enable row level security', t);
    execute format('create policy sync_all on mirror.%I for all to sync_worker using (true) with check (true)', t);
  end loop;
end $do$;

-- Generated columns call these at insert/update time as sync_worker; views call them as
-- the invoking API role. EXECUTE is checked against the caller even inside a view.
grant execute on function mirror.num_label(numeric), mirror.category_synonyms(text, text),
  mirror.build_search(text, text, text, text, text, text, text, text, text, text, text, text, text, numeric, numeric, text, text, smallint, text, text[], text)
  to sync_worker, anon, authenticated;
grant execute on function mirror.is_public(boolean, text), mirror.price_unit(text, text),
  mirror.variant_label(text, numeric, text, text, text), mirror.image_url(text, jsonb, text, int)
  to anon, authenticated, sync_worker;

-- --------------------------------------------------------------------------
-- 7. api helpers
-- --------------------------------------------------------------------------
create function api.today() returns date
language sql stable parallel safe as $fn$
  select (now() at time zone 'America/Toronto')::date
$fn$;
grant execute on function api.today() to anon, authenticated;

-- --------------------------------------------------------------------------
-- 8. Views
-- --------------------------------------------------------------------------
-- Owner-privilege views (the default). Computed columns are scalar subqueries in the
-- select list so the planner drops the ones a query does not reference.

create view api.catalogue_public as
select
  c.sku, c.product_name, c.brand, c.collection, c.product_type, c.category, c.material_type,
  c.species, c.colour_tone, c.grade, c.layout_pattern,
  c.width_in, c.length, c.thickness_mm, c.wear_layer_mil, c.veneer_mm, c.veneer_cut_type, c.ac_rating,
  c.finish_type, c.install_profile, c.install_method, c.locking_system, c.underpad_included, c.underpad_type,
  c.iic_rating, c.stc_rating, c.tile_format, c.weight_per_piece_kg, c.certifications,
  nullif(c.retail_price, 0)                                        as retail_price,
  (c.retail_price is null or c.retail_price = 0)                   as price_on_request,
  mirror.price_unit(c.product_type, c.category)                    as price_unit,
  coalesce(c.promo_cost is not null and c.promo_end_date >= api.today(), false) as promo_active,
  c.box_size_sf, c.pieces_per_box, c.stock_status,
  coalesce(c.salesperson_notes ~* '^\s*coming soon', false)         as coming_soon,
  c.waterproof, c.pet_friendly, c.radiant_heat_compatible, c.traffic_rating, c.suitable_rooms,
  c.residential_warranty_yrs, c.commercial_warranty_yrs,
  c.undertone, c.tone_depth, c.texture, c.style, c.busyness,
  (select jsonb_agg(jsonb_build_object('sku', p.sku, 'product_name', p.product_name) order by o.ord)
     from unnest(regexp_split_to_array(coalesce(c.pairs_well_with, ''), '\s*[,;\n]+\s*')) with ordinality o(tok, ord)
     join mirror.catalogue p on p.sku = trim(o.tok)
    where mirror.is_public(p.active, p.stock_status))              as pairs_well_with,
  (select jsonb_agg(jsonb_build_object('sku', v.sku, 'product_name', v.product_name, 'grade', v.grade,
                                       'variant_label', mirror.variant_label(v.grade, v.width_in, v.length, v.finish_type, v.product_name))
                    order by v.grade nulls last, v.width_in, v.product_name)
     from mirror.catalogue v
    where c.variant_group is not null and v.variant_group = c.variant_group
      and v.airtable_record_id <> c.airtable_record_id
      and mirror.is_public(v.active, v.stock_status))               as variants,
  (select jsonb_agg(jsonb_build_object(
            'kind', i.kind, 'sort', i.sort_order, 'w', i.width, 'h', i.height, 'blurhash', i.blurhash,
            'thumb', mirror.image_url(i.public_base_url, i.variant_paths, '200',  i.encoder_version),
            'card',  mirror.image_url(i.public_base_url, i.variant_paths, '600',  i.encoder_version),
            'full',  mirror.image_url(i.public_base_url, i.variant_paths, '1600', i.encoder_version))
          order by case i.kind when 'swatch' then 0 when 'room' then 1 else 2 end, i.sort_order, i.id)
     from mirror.catalogue_images i
    where i.airtable_record_id = c.airtable_record_id and i.deleted_at is null) as images,
  (select jsonb_build_object(
            'kind', i.kind, 'w', i.width, 'h', i.height, 'blurhash', i.blurhash,
            'thumb', mirror.image_url(i.public_base_url, i.variant_paths, '200',  i.encoder_version),
            'card',  mirror.image_url(i.public_base_url, i.variant_paths, '600',  i.encoder_version),
            'full',  mirror.image_url(i.public_base_url, i.variant_paths, '1600', i.encoder_version))
     from mirror.catalogue_images i
    where i.airtable_record_id = c.airtable_record_id and i.deleted_at is null and i.kind in ('swatch', 'room')
    order by case i.kind when 'swatch' then 0 else 1 end, i.sort_order, i.id
    limit 1)                                                         as hero,
  c.search_public
from mirror.catalogue c
where mirror.is_public(c.active, c.stock_status);

create view api.catalogue_staff as
select
  c.sku, c.product_name, c.brand, c.collection, c.product_type, c.category, c.material_type,
  c.species, c.colour_tone, c.grade, c.layout_pattern,
  c.width_in, c.length, c.thickness_mm, c.wear_layer_mil, c.veneer_mm, c.veneer_cut_type, c.ac_rating,
  c.finish_type, c.install_profile, c.install_method, c.locking_system, c.underpad_included, c.underpad_type,
  c.iic_rating, c.stc_rating, c.tile_format, c.weight_per_piece_kg, c.certifications,
  c.retail_price,
  (c.retail_price is null or c.retail_price = 0)                   as price_on_request,
  mirror.price_unit(c.product_type, c.category)                    as price_unit,
  coalesce(c.promo_cost is not null and c.promo_end_date >= api.today(), false) as promo_active,
  c.box_size_sf, c.pieces_per_box, c.stock_status,
  coalesce(c.salesperson_notes ~* '^\s*coming soon', false)         as coming_soon,
  c.waterproof, c.pet_friendly, c.radiant_heat_compatible, c.traffic_rating, c.suitable_rooms,
  c.residential_warranty_yrs, c.commercial_warranty_yrs,
  c.undertone, c.tone_depth, c.texture, c.style, c.busyness,
  -- staff tier
  c.supplier, c.supplier_sku, c.cost, c.map_price, c.pallet_price, c.promo_cost, c.promo_end_date,
  c.volume_pricing_notes, c.last_price_update, c.price_last_changed_by,
  (c.last_price_update is null or c.last_price_update < api.today() - 90) as price_stale,
  (c.promo_cost is not null and c.promo_end_date is null)          as promo_open_ended,
  c.boxes_per_skid, c.pieces_per_pallet, c.active,
  c.salesperson_notes, c.internal_notes, c.price_list_url,
  c.style_tags_status, c.style_tags_evidence,
  'https://airtable.com/' || (select value from mirror.settings where key = 'airtable_base_id')
     || '/' || (select value from mirror.settings where key = 'airtable_table_id')
     || '/' || c.airtable_record_id                                 as airtable_url,
  (select jsonb_agg(jsonb_build_object('sku', p.sku, 'product_name', p.product_name, 'active', p.active) order by o.ord)
     from unnest(regexp_split_to_array(coalesce(c.pairs_well_with, ''), '\s*[,;\n]+\s*')) with ordinality o(tok, ord)
     join mirror.catalogue p on p.sku = trim(o.tok))                 as pairs_well_with,
  (select jsonb_agg(jsonb_build_object('sku', v.sku, 'product_name', v.product_name, 'grade', v.grade, 'active', v.active,
                                       'variant_label', mirror.variant_label(v.grade, v.width_in, v.length, v.finish_type, v.product_name))
                    order by v.grade nulls last, v.width_in, v.product_name)
     from mirror.catalogue v
    where c.variant_group is not null and v.variant_group = c.variant_group
      and v.airtable_record_id <> c.airtable_record_id)              as variants,
  (select jsonb_agg(jsonb_build_object(
            'kind', i.kind, 'sort', i.sort_order, 'w', i.width, 'h', i.height, 'blurhash', i.blurhash, 'low_res', i.low_res,
            'thumb', mirror.image_url(i.public_base_url, i.variant_paths, '200',  i.encoder_version),
            'card',  mirror.image_url(i.public_base_url, i.variant_paths, '600',  i.encoder_version),
            'full',  mirror.image_url(i.public_base_url, i.variant_paths, '1600', i.encoder_version))
          order by case i.kind when 'swatch' then 0 when 'room' then 1 else 2 end, i.sort_order, i.id)
     from mirror.catalogue_images i
    where i.airtable_record_id = c.airtable_record_id and i.deleted_at is null) as images,
  (select jsonb_build_object(
            'kind', i.kind, 'w', i.width, 'h', i.height, 'blurhash', i.blurhash, 'low_res', i.low_res,
            'thumb', mirror.image_url(i.public_base_url, i.variant_paths, '200',  i.encoder_version),
            'card',  mirror.image_url(i.public_base_url, i.variant_paths, '600',  i.encoder_version),
            'full',  mirror.image_url(i.public_base_url, i.variant_paths, '1600', i.encoder_version))
     from mirror.catalogue_images i
    where i.airtable_record_id = c.airtable_record_id and i.deleted_at is null and i.kind in ('swatch', 'room')
    order by case i.kind when 'swatch' then 0 else 1 end, i.sort_order, i.id
    limit 1)                                                         as hero,
  c.search_staff
from mirror.catalogue c;

create view api.catalogue_facets as
select 'supplier'  as facet, supplier  as value, count(*)::int as n from mirror.catalogue where supplier  is not null group by supplier
union all
select 'category',  category,  count(*)::int from mirror.catalogue where category  is not null group by category
union all
select 'undertone', undertone, count(*)::int from mirror.catalogue where undertone is not null group by undertone
union all
select 'texture',   texture,   count(*)::int from mirror.catalogue where texture   is not null group by texture
union all
select 'busyness',  busyness,  count(*)::int from mirror.catalogue where busyness  is not null group by busyness
union all
select 'style', s, count(*)::int from mirror.catalogue, unnest(style) s group by s;

create view api.sync_status as
select
  (select max(finished_at) from mirror.sync_runs where status = 'success' and mode in ('incremental', 'full')) as last_success_at,
  (select started_at from mirror.sync_runs order by started_at desc limit 1)  as last_started_at,
  (select status     from mirror.sync_runs order by started_at desc limit 1)  as last_status,
  (select mode       from mirror.sync_runs order by started_at desc limit 1)  as last_mode,
  (select count(*)::int from mirror.catalogue)                                 as rows;

grant select on api.catalogue_public to anon, authenticated;
grant select on api.catalogue_staff, api.catalogue_facets, api.sync_status to authenticated;

-- --------------------------------------------------------------------------
-- 9. Search: query parsing + ranked search functions
-- --------------------------------------------------------------------------
create type api.parsed_query as (
  free_text       text,
  tsq             tsquery,
  width_in        numeric,
  thickness_mm    numeric,
  install_profile text,
  promo           boolean,
  clearance       boolean,
  waterproof      boolean,
  pet             boolean,
  radiant         boolean,
  category_in     text[],
  price_min       numeric,
  price_max       numeric
);

-- Turns "6in click on promo under $4" into filters + free text. Style words (light, warm,
-- brushed, modern …) are NOT stripped: they match the weight-D search segment instead,
-- which degrades gracefully while the design fields are sparsely filled.
create function api.parse_query(q text) returns api.parsed_query
language plpgsql immutable parallel safe as $fn$
declare
  s text := ' ' || lower(coalesce(q, '')) || ' ';
  m text[];
  r api.parsed_query;
  cats text[] := '{}';
begin
  r.promo := false; r.clearance := false; r.waterproof := false; r.pet := false; r.radiant := false;

  -- price bounds
  m := regexp_match(s, '\m(?:under|below|less than|max(?:imum)?|up to|<)\s*\$?\s*(\d+(?:\.\d+)?)\M');
  if m is not null then r.price_max := m[1]::numeric; s := regexp_replace(s, '\m(?:under|below|less than|max(?:imum)?|up to|<)\s*\$?\s*\d+(?:\.\d+)?\M', ' '); end if;
  m := regexp_match(s, '\m(?:over|above|more than|min(?:imum)?|>)\s*\$?\s*(\d+(?:\.\d+)?)\M');
  if m is not null then r.price_min := m[1]::numeric; s := regexp_replace(s, '\m(?:over|above|more than|min(?:imum)?|>)\s*\$?\s*\d+(?:\.\d+)?\M', ' '); end if;

  -- thickness before width so "12mm" is never read as a width
  m := regexp_match(s, '(\d+(?:\.\d+)?)\s*-?\s*mm\M');
  if m is not null then r.thickness_mm := m[1]::numeric; s := regexp_replace(s, '\d+(?:\.\d+)?\s*-?\s*mm\M', ' '); end if;
  m := regexp_match(s, '(\d+(?:\.\d+)?)\s*-?\s*(?:in\M|inch(?:es)?\M|")');
  if m is not null then r.width_in := m[1]::numeric; s := regexp_replace(s, '\d+(?:\.\d+)?\s*-?\s*(?:in\M|inch(?:es)?\M|")', ' '); end if;

  -- install profile
  if s ~ '\m(?:click|clic|floating|drop ?lock)\M' then r.install_profile := 'Click'; s := regexp_replace(s, '\m(?:click|clic|floating|drop ?lock)\M', ' ', 'g');
  elsif s ~ '(?:\mt\s*&\s*g\M|\mtongue (?:and|&) groove\M|\mnail[ -]?down\M)' then r.install_profile := 'T&G'; s := regexp_replace(s, '(?:\mt\s*&\s*g\M|\mtongue (?:and|&) groove\M|\mnail[ -]?down\M)', ' ', 'g');
  elsif s ~ '\mglue[ -]?down\M' then r.install_profile := 'Glue down'; s := regexp_replace(s, '\mglue[ -]?down\M', ' ', 'g');
  elsif s ~ '\mloose[ -]?lay\M' then r.install_profile := 'Loose lay'; s := regexp_replace(s, '\mloose[ -]?lay\M', ' ', 'g');
  end if;

  -- promo / clearance / suitability flags
  if s ~ '\m(?:on )?(?:promo(?:tion)?|sale|special)\M' then r.promo := true; s := regexp_replace(s, '\m(?:on )?(?:promo(?:tion)?|sale|special)\M', ' ', 'g'); end if;
  if s ~ '\mclearance\M' then r.clearance := true; s := regexp_replace(s, '\mclearance\M', ' ', 'g'); end if;
  if s ~ '\mwater ?proof\M' then r.waterproof := true; s := regexp_replace(s, '\mwater ?proof\M', ' ', 'g'); end if;
  if s ~ '\mpet(?:s|[ -]?friendly|[ -]?proof)?\M' then r.pet := true; s := regexp_replace(s, '\mpet(?:s|[ -]?friendly|[ -]?proof)?\M', ' ', 'g'); end if;
  if s ~ '\m(?:radiant(?: heat)?|heated floors?|in[ -]?floor heat(?:ing)?)\M' then r.radiant := true; s := regexp_replace(s, '\m(?:radiant(?: heat)?|heated floors?|in[ -]?floor heat(?:ing)?)\M', ' ', 'g'); end if;

  -- categories
  if s ~ '\m(?:vinyl|lvp|lvt|spc|wpc)\M' then cats := cats || array['LVP', 'LVT']; s := regexp_replace(s, '\m(?:vinyl|lvp|lvt|spc|wpc)\M', ' ', 'g'); end if;
  if s ~ '\mlaminates?\M' then cats := cats || array['Laminate']; s := regexp_replace(s, '\mlaminates?\M', ' ', 'g'); end if;
  if s ~ '\mengineered\M' then cats := cats || array['Engineered hardwood']; s := regexp_replace(s, '\mengineered(?: hardwood| wood)?\M', ' ', 'g');
  elsif s ~ '\msolid(?: hardwood| wood)?\M' then cats := cats || array['Solid hardwood']; s := regexp_replace(s, '\msolid(?: hardwood| wood)?\M', ' ', 'g');
  elsif s ~ '\mhardwood\M' then cats := cats || array['Engineered hardwood', 'Solid hardwood']; s := regexp_replace(s, '\mhardwood\M', ' ', 'g');
  end if;
  if s ~ '\m(?:tiles?|porcelain|ceramic)\M' then cats := cats || array['Tile / Stone']; s := regexp_replace(s, '\m(?:tiles?|porcelain|ceramic)\M', ' ', 'g'); end if;
  if s ~ '\mcarpets?\M' then cats := cats || array['Carpet']; s := regexp_replace(s, '\mcarpets?\M', ' ', 'g'); end if;
  if array_length(cats, 1) > 0 then r.category_in := cats; end if;

  -- filler
  s := regexp_replace(s, '\m(?:what|whats|what''s|which|is|are|do|does|we|have|has|any|show|me|find|get|the|a|an|on|in|for|with|of|to|i|want|need|looking|please|floors?|flooring|products?|options?)\M', ' ', 'g');
  s := regexp_replace(s, '[?!,.:;()]', ' ', 'g');
  s := btrim(regexp_replace(s, '\s+', ' ', 'g'));
  r.free_text := s;

  if s <> '' then
    select string_agg(quote_literal(lexeme) || ':*', ' & ' order by positions[1])::tsquery
      into r.tsq
      from unnest(to_tsvector('simple', translate(s, '-/_', '   ')));
  end if;
  return r;
end
$fn$;
grant execute on function api.parse_query(text) to anon, authenticated;

-- Staff search over api.catalogue_staff. Two stages: rank + page on light columns, then
-- join back for the card projection. No STRICT, no SET search_path: keeps it inlinable.
create function api.search_staff(
  q text default '',
  f_supplier text[] default null, f_category text[] default null,
  f_price_min numeric default null, f_price_max numeric default null,
  f_waterproof boolean default null, f_radiant boolean default null, f_pet boolean default null,
  f_hide_unavailable boolean default false,
  f_undertone text[] default null, f_tone_depth_min int default null, f_tone_depth_max int default null,
  f_texture text[] default null, f_style text[] default null, f_busyness text[] default null,
  lim int default 30, off int default 0
) returns table (
  sku text, product_name text, brand text, category text, supplier text,
  retail_price numeric, price_unit text, price_on_request boolean, promo_active boolean,
  coming_soon boolean, stock_status text, hero jsonb, total_count bigint, rank real, parsed jsonb
)
language sql stable parallel safe as $fn$
  with p as (select * from api.parse_query(q)),
  hits as (
    select c.sku,
           count(*) over () as total_count,
           (case when p.tsq is null then 0 else ts_rank_cd(c.search_staff, p.tsq, 32) end
            + case when p.free_text = '' then 0 else extensions.word_similarity(p.free_text, c.product_name) end)::real as rank
      from api.catalogue_staff c, p
     -- Browse (empty free_text) is covered by the ILIKE arm matching '%%'; keeping every arm
     -- indexable lets the planner BitmapOr the tsvector and trigram GIN indexes.
     where (c.search_staff @@ p.tsq
            or p.free_text operator(extensions.<%) c.product_name
            or c.sku ilike '%' || p.free_text || '%')
       and (f_supplier is null or c.supplier = any (f_supplier))
       and (f_category is null or c.category = any (f_category))
       and (p.category_in is null or c.category = any (p.category_in))
       and (p.width_in is null or (c.width_in is not null and abs(c.width_in - p.width_in) <= 0.25))
       and (p.thickness_mm is null or (c.thickness_mm is not null and abs(c.thickness_mm - p.thickness_mm) <= 0.5))
       and (p.install_profile is null or c.install_profile ilike p.install_profile || '%')
       and (not p.promo or c.promo_active)
       and (not p.clearance or c.stock_status = 'Clearance')
       and (not p.waterproof or c.waterproof)
       and (not p.pet or c.pet_friendly)
       and (not p.radiant or c.radiant_heat_compatible)
       and (f_waterproof is null or c.waterproof = f_waterproof)
       and (f_radiant is null or c.radiant_heat_compatible = f_radiant)
       and (f_pet is null or c.pet_friendly = f_pet)
       and (greatest(f_price_min, p.price_min) is null
            or (c.price_unit = 'sf' and not c.price_on_request and c.retail_price >= greatest(f_price_min, p.price_min)))
       and (least(f_price_max, p.price_max) is null
            or (c.price_unit = 'sf' and not c.price_on_request and c.retail_price <= least(f_price_max, p.price_max)))
       and (not f_hide_unavailable
            or (c.stock_status is distinct from 'Discontinued' and c.stock_status is distinct from 'Special order' and not c.coming_soon))
       and (f_undertone is null or c.undertone = any (f_undertone))
       and (f_tone_depth_min is null or c.tone_depth >= f_tone_depth_min)
       and (f_tone_depth_max is null or c.tone_depth <= f_tone_depth_max)
       and (f_texture is null or c.texture = any (f_texture))
       and (f_style is null or c.style && f_style)
       and (f_busyness is null or c.busyness = any (f_busyness))
     order by rank desc, c.product_name
     limit least(greatest(coalesce(lim, 30), 1), 50) offset greatest(coalesce(off, 0), 0)
  )
  select c.sku, c.product_name, c.brand, c.category, c.supplier,
         c.retail_price, c.price_unit, c.price_on_request, c.promo_active,
         c.coming_soon, c.stock_status, c.hero, h.total_count, h.rank,
         (select to_jsonb(p) - 'tsq' from p) as parsed
    from hits h
    join api.catalogue_staff c on c.sku = h.sku
   order by h.rank desc, c.product_name
$fn$;

-- Public search over api.catalogue_public: same shape minus supplier.
create function api.search_public(
  q text default '',
  f_category text[] default null,
  f_price_min numeric default null, f_price_max numeric default null,
  f_waterproof boolean default null, f_radiant boolean default null, f_pet boolean default null,
  f_hide_unavailable boolean default false,
  f_undertone text[] default null, f_tone_depth_min int default null, f_tone_depth_max int default null,
  f_texture text[] default null, f_style text[] default null, f_busyness text[] default null,
  lim int default 30, off int default 0
) returns table (
  sku text, product_name text, brand text, category text,
  retail_price numeric, price_unit text, price_on_request boolean, promo_active boolean,
  coming_soon boolean, stock_status text, hero jsonb, total_count bigint, rank real, parsed jsonb
)
language sql stable parallel safe as $fn$
  with p as (select * from api.parse_query(q)),
  hits as (
    select c.sku,
           count(*) over () as total_count,
           (case when p.tsq is null then 0 else ts_rank_cd(c.search_public, p.tsq, 32) end
            + case when p.free_text = '' then 0 else extensions.word_similarity(p.free_text, c.product_name) end)::real as rank
      from api.catalogue_public c, p
     where (c.search_public @@ p.tsq
            or p.free_text operator(extensions.<%) c.product_name
            or c.sku ilike '%' || p.free_text || '%')
       and (f_category is null or c.category = any (f_category))
       and (p.category_in is null or c.category = any (p.category_in))
       and (p.width_in is null or (c.width_in is not null and abs(c.width_in - p.width_in) <= 0.25))
       and (p.thickness_mm is null or (c.thickness_mm is not null and abs(c.thickness_mm - p.thickness_mm) <= 0.5))
       and (p.install_profile is null or c.install_profile ilike p.install_profile || '%')
       and (not p.promo or c.promo_active)
       and (not p.clearance or c.stock_status = 'Clearance')
       and (not p.waterproof or c.waterproof)
       and (not p.pet or c.pet_friendly)
       and (not p.radiant or c.radiant_heat_compatible)
       and (f_waterproof is null or c.waterproof = f_waterproof)
       and (f_radiant is null or c.radiant_heat_compatible = f_radiant)
       and (f_pet is null or c.pet_friendly = f_pet)
       and (greatest(f_price_min, p.price_min) is null
            or (c.price_unit = 'sf' and not c.price_on_request and c.retail_price >= greatest(f_price_min, p.price_min)))
       and (least(f_price_max, p.price_max) is null
            or (c.price_unit = 'sf' and not c.price_on_request and c.retail_price <= least(f_price_max, p.price_max)))
       and (not f_hide_unavailable
            or (c.stock_status is distinct from 'Special order' and not c.coming_soon))
       and (f_undertone is null or c.undertone = any (f_undertone))
       and (f_tone_depth_min is null or c.tone_depth >= f_tone_depth_min)
       and (f_tone_depth_max is null or c.tone_depth <= f_tone_depth_max)
       and (f_texture is null or c.texture = any (f_texture))
       and (f_style is null or c.style && f_style)
       and (f_busyness is null or c.busyness = any (f_busyness))
     order by rank desc, c.product_name
     limit least(greatest(coalesce(lim, 30), 1), 50) offset greatest(coalesce(off, 0), 0)
  )
  select c.sku, c.product_name, c.brand, c.category,
         c.retail_price, c.price_unit, c.price_on_request, c.promo_active,
         c.coming_soon, c.stock_status, c.hero, h.total_count, h.rank,
         (select to_jsonb(p) - 'tsq' from p) as parsed
    from hits h
    join api.catalogue_public c on c.sku = h.sku
   order by h.rank desc, c.product_name
$fn$;

grant execute on function api.search_public(text, text[], numeric, numeric, boolean, boolean, boolean, boolean, text[], int, int, text[], text[], text[], int, int) to anon, authenticated;
grant execute on function api.search_staff(text, text[], text[], numeric, numeric, boolean, boolean, boolean, boolean, text[], int, int, text[], text[], text[], int, int) to authenticated;

-- --------------------------------------------------------------------------
-- 10. api.search_log — insert-only audit of staff searches
-- --------------------------------------------------------------------------
create table api.search_log (
  id           bigint generated always as identity primary key,
  user_id      uuid not null default auth.uid(),          -- no FK: the log must survive offboarding
  user_email   text default (auth.jwt() ->> 'email'),
  query        text not null,
  filters      jsonb,
  result_count int,
  took_ms      int,
  created_at   timestamptz not null default now()
);
create index search_log_created_idx on api.search_log (created_at desc);
alter table api.search_log enable row level security;
create policy search_log_insert_own on api.search_log
  for insert to authenticated with check (user_id = auth.uid());
grant insert on api.search_log to authenticated;
grant usage on sequence api.search_log_id_seq to authenticated;

-- --------------------------------------------------------------------------
-- 11. Sign-up restriction: Before User Created hook (+ trigger fallback)
-- --------------------------------------------------------------------------
create function mirror.hook_restrict_signup(event jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
declare
  email text := event -> 'user' ->> 'email';
begin
  if mirror.email_domain_allowed(email) then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object('error', jsonb_build_object(
    'http_code', 403,
    'message', 'This app is for Titan Flooring staff accounts only.'));
end
$fn$;
grant execute on function mirror.hook_restrict_signup(jsonb) to supabase_auth_admin;
grant usage on schema mirror to supabase_auth_admin;

create function mirror.enforce_signup_domain() returns trigger
language plpgsql security definer set search_path = '' as $fn$
begin
  if not mirror.email_domain_allowed(new.email) then
    raise exception 'sign-up rejected: % is not an allowed staff domain', new.email
      using errcode = 'P0001';
  end if;
  return new;
end
$fn$;
grant execute on function mirror.enforce_signup_domain() to supabase_auth_admin;
grant execute on function mirror.email_domain_allowed(text) to supabase_auth_admin;

create trigger titan_enforce_signup_domain
  before insert on auth.users
  for each row execute function mirror.enforce_signup_domain();

-- --------------------------------------------------------------------------
-- 12. Revoke the built-in PUBLIC EXECUTE from every function in api and mirror, then
--     re-grant exactly what the views, generated columns and the API need.
-- --------------------------------------------------------------------------
do $do$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname in ('api', 'mirror') loop
    execute format('revoke execute on function %s from public', f.sig);
  end loop;
end $do$;

grant execute on function api.today() to anon, authenticated;
grant execute on function api.parse_query(text) to anon, authenticated;
grant execute on function api.search_public(text, text[], numeric, numeric, boolean, boolean, boolean, boolean, text[], int, int, text[], text[], text[], int, int) to anon, authenticated;
grant execute on function api.search_staff(text, text[], text[], numeric, numeric, boolean, boolean, boolean, boolean, text[], int, int, text[], text[], text[], int, int) to authenticated;
grant execute on function mirror.num_label(numeric), mirror.category_synonyms(text, text),
  mirror.build_search(text, text, text, text, text, text, text, text, text, text, text, text, text, numeric, numeric, text, text, smallint, text, text[], text)
  to sync_worker, anon, authenticated;
grant execute on function mirror.is_public(boolean, text), mirror.price_unit(text, text),
  mirror.variant_label(text, numeric, text, text, text), mirror.image_url(text, jsonb, text, int)
  to anon, authenticated, sync_worker;
grant execute on function mirror.hook_restrict_signup(jsonb), mirror.enforce_signup_domain(), mirror.email_domain_allowed(text)
  to supabase_auth_admin;
