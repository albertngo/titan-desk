-- 006: the askBert assistant's only window onto the catalogue.
--
-- askBert (the eve agent in web/agents/askbert) reads products through ONE view, as ONE role,
-- and nothing else. Cost, margin and every internal pricing field are left out of the view,
-- so no prompt, instruction or bug in the agent can reach them: the role has no other grant.
--
--   * schema askbert is NOT exposed through PostgREST (Exposed schemas stays `api`).
--   * role askbert_reader: SELECT on askbert.catalogue, USAGE on schema askbert, nothing else.
--     It is created NOLOGIN here; Albert enables it once in the SQL editor with
--       alter role askbert_reader login password '<generated>';
--     and the web app reads it from ASKBERT_DATABASE_URL (server-only, transaction pooler).
--   * The view uses core SQL only. EXECUTE on a function is checked against the querying role
--     even inside a view, so calling mirror.* / api.* helpers here would need grants the role
--     must not have. The expressions below copy api.catalogue_public's rules instead.
--
-- Tier lists live in db/README.md ("askBert tier"); test 010_askbert.sql pins them.

create schema askbert;
revoke all on schema askbert from public;

create view askbert.catalogue as
select
  c.sku, c.product_name, c.brand, c.supplier, c.collection, c.product_type, c.category,
  c.material_type, c.species, c.colour_tone, c.grade, c.layout_pattern,
  c.width_in, c.length, c.thickness_mm, c.wear_layer_mil, c.veneer_mm, c.ac_rating,
  c.finish_type, c.install_profile, c.install_method, c.locking_system,
  c.underpad_included, c.underpad_type, c.iic_rating, c.stc_rating, c.tile_format,
  c.box_size_sf, c.pieces_per_box,
  nullif(c.retail_price, 0)                                          as retail_price,
  (c.retail_price is null or c.retail_price = 0)                     as price_on_request,
  -- = mirror.price_unit(product_type, category)
  case when c.category = 'STONE' then 'piece'
       when c.product_type is not null and c.product_type <> 'Flooring' then 'piece'
       else 'sf' end                                                 as price_unit,
  -- = api.catalogue_public.promo_active, with api.today() inlined
  coalesce(c.promo_cost is not null
           and c.promo_end_date >= (now() at time zone 'America/Toronto')::date, false) as promo_active,
  c.promo_end_date                                                   as promo_ends,
  c.last_price_update                                                as price_as_of,
  c.price_list_date,
  c.stock_status,
  not c.active                                                       as archived,
  coalesce(c.salesperson_notes ~* '^\s*coming soon', false)          as coming_soon,
  -- The sync stores a blank Airtable checkbox as false, so false means "not confirmed".
  c.waterproof                                                       as waterproof_confirmed,
  c.pet_friendly                                                     as pet_friendly_confirmed,
  c.radiant_heat_compatible                                          as radiant_heat_confirmed,
  c.traffic_rating, c.suitable_rooms,
  c.residential_warranty_yrs, c.commercial_warranty_yrs,
  c.undertone, c.tone_depth, c.texture, c.style, c.busyness,
  -- = the 200px variant of api.catalogue_public.hero (first swatch, else first room scene)
  (select case when i.variant_paths ? '200'
            then i.public_base_url || '/' || (i.variant_paths -> '200' ->> 'path') || '?v=' || i.encoder_version end
     from mirror.catalogue_images i
    where i.airtable_record_id = c.airtable_record_id and i.deleted_at is null and i.kind in ('swatch', 'room')
    order by case i.kind when 'swatch' then 0 else 1 end, i.sort_order, i.id
    limit 1)                                                         as thumb_url,
  c.search_public                                                    -- for keyword filtering; never returned
from mirror.catalogue c;                                             -- every product; archived ones are flagged

comment on view askbert.catalogue is
  'askBert assistant view. No cost/margin/internal pricing. Read only by role askbert_reader. See db/README.md.';

-- Roles are cluster-wide; create once, then (re)assert the attributes this migration may set.
-- A new role is already NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION; a migration
-- role without those powers (hosted Supabase) may not even name them, so they keep the defaults
-- and test 010 checks them.
do $do$
begin
  if not exists (select 1 from pg_roles where rolname = 'askbert_reader') then
    create role askbert_reader nologin;
  end if;
end $do$;
alter role askbert_reader noinherit connection limit 10;
grant usage on schema askbert to askbert_reader;
grant select on askbert.catalogue to askbert_reader;

alter role askbert_reader set default_transaction_read_only = on;
alter role askbert_reader set statement_timeout = '2s';
alter role askbert_reader set idle_in_transaction_session_timeout = '5s';
alter role askbert_reader set search_path = askbert;
