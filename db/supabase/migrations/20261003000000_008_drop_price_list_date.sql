-- 008: drop Price List Date (Albert, 2026-10-03).
-- Price List URL and Effective Date always refer to the same supplier price list, so the
-- product page dates the list with Effective Date (last_price_update) and the separate
-- Price List Date column (migration 003) is gone everywhere: the sync no longer copies it,
-- api.catalogue_staff and api.askbert_search no longer return it, and the mirror drops it.
-- Append-only: 003 and 006 are untouched. The view and the function change shape, so both are
-- dropped and recreated (create or replace can't remove a column); grants are re-applied.
-- Neither has dependants that Postgres tracks (the search functions are plain LANGUAGE sql).

drop function api.askbert_search(text, text, text, text[], text, text[], numeric, numeric, text, boolean, boolean, boolean, boolean, text, text, text, int, int, numeric, numeric, numeric, text, text, boolean, text, int);
drop view api.catalogue_staff;

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
  c.promo_list_url, c.rep_cost, c.rep_cost_end_date, c.rep_cost_note,
  coalesce(c.rep_cost is not null and (c.rep_cost_end_date is null or c.rep_cost_end_date >= api.today()), false) as rep_cost_active,
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

revoke all on api.catalogue_staff from public, anon;
grant select on api.catalogue_staff to authenticated;

create function api.askbert_search(
  p_kw text default null,
  p_kw_like text default null,
  p_sku text default null,
  p_cats text[] default null,
  p_brand_like text default null,
  p_sups text[] default null,
  p_pmin numeric default null,
  p_pmax numeric default null,
  p_unit text default 'sf',
  p_req_wp boolean default false,
  p_req_rad boolean default false,
  p_req_pet boolean default false,
  p_req_pad boolean default false,
  p_room text default null,
  p_colour_like text default null,
  p_undertone text default null,
  p_tone_min int default null,
  p_tone_max int default null,
  p_wmin numeric default null,
  p_wmax numeric default null,
  p_wear_min numeric default null,
  p_install_like text default null,
  p_availability text default 'any',
  p_promo_only boolean default false,
  p_sort text default 'relevance',
  p_lim int default 5
) returns table (
  sku text,
  product_name text,
  brand text,
  supplier text,
  supplier_sku text,
  category text,
  material_type text,
  colour_tone text,
  grade text,
  retail_price float8,
  price_unit text,
  price_on_request boolean,
  promo_active boolean,
  promo_ends text,
  price_as_of text,
  price_list_url text,
  cost float8,
  map_price float8,
  pallet_price float8,
  promo_cost float8,
  rep_cost_active boolean,
  rep_cost float8,
  rep_cost_end_date text,
  rep_cost_note text,
  volume_pricing_notes text,
  salesperson_notes text,
  internal_notes text,
  stock_status text,
  archived boolean,
  coming_soon boolean,
  width_in float8,
  thickness_mm float8,
  wear_layer_mil float8,
  ac_rating text,
  install_profile text,
  box_size_sf float8,
  waterproof_confirmed boolean,
  radiant_heat_confirmed boolean,
  pet_friendly_confirmed boolean,
  underpad_included boolean,
  suitable_rooms text[],
  thumb_url text,
  total_matches bigint
)
language sql stable
as $fn$
  with q as (
    select p_kw as kw, p_kw_like as kw_like, p_sku as sku, p_cats as cats, p_brand_like as brand_like, p_sups as sups, p_pmin as pmin, p_pmax as pmax, p_unit as unit, p_req_wp as req_wp, p_req_rad as req_rad, p_req_pet as req_pet, p_req_pad as req_pad, p_room as room, p_colour_like as colour_like, p_undertone as undertone, p_tone_min as tone_min, p_tone_max as tone_max, p_wmin as wmin, p_wmax as wmax, p_wear_min as wear_min, p_install_like as install_like, p_availability as availability, p_promo_only as promo_only, p_sort as sort, p_lim as lim,
           case when p_kw is null then null else
             (select string_agg(quote_literal(lexeme) || ':*', ' & ')
                from unnest(to_tsvector('simple', translate(p_kw, '-/_', '   '))))::tsquery end as tsq
  ),
  m as (
    select c.*, q.sort,
           case when q.tsq is null then 0 else ts_rank_cd(c.search_staff, q.tsq) end as rank,
           coalesce(not (q.kw is not null) or (c.search_staff @@ q.tsq or c.product_name ilike q.kw_like or c.sku ilike q.kw_like or c.supplier_sku ilike q.kw_like), false) as f_keyword,
           coalesce(not (q.sku is not null) or (upper(c.sku) = upper(q.sku)), false) as f_sku,
           coalesce(not (q.cats is not null) or (c.category = any(q.cats)), false) as f_categories,
           coalesce(not (q.brand_like is not null) or (c.brand ilike q.brand_like), false) as f_brand,
           coalesce(not (q.sups is not null) or (upper(c.supplier) = any(q.sups)), false) as f_suppliers,
           coalesce(not (q.pmin is not null or q.pmax is not null) or (c.price_unit = q.unit and not c.price_on_request and (q.pmin is null or c.retail_price >= q.pmin) and (q.pmax is null or c.retail_price <= q.pmax)), false) as f_price,
           coalesce(not (q.req_wp or q.req_rad or q.req_pet or q.req_pad) or ((not q.req_wp or c.waterproof) and (not q.req_rad or c.radiant_heat_compatible) and (not q.req_pet or c.pet_friendly) and (not q.req_pad or c.underpad_included)), false) as f_requires,
           coalesce(not (q.room is not null) or (exists (select 1 from unnest(c.suitable_rooms) r where lower(r) = lower(q.room))), false) as f_room,
           coalesce(not (q.colour_like is not null) or (c.colour_tone ilike q.colour_like), false) as f_colour,
           coalesce(not (q.undertone is not null) or (c.undertone = q.undertone), false) as f_undertone,
           coalesce(not (q.tone_min is not null) or (c.tone_depth between q.tone_min and q.tone_max), false) as f_tone,
           coalesce(not (q.wmin is not null or q.wmax is not null) or ((q.wmin is null or c.width_in >= q.wmin) and (q.wmax is null or c.width_in <= q.wmax)), false) as f_width,
           coalesce(not (q.wear_min is not null) or (c.wear_layer_mil >= q.wear_min), false) as f_wear_layer,
           coalesce(not (q.install_like is not null) or (c.install_profile ilike q.install_like), false) as f_install,
           coalesce(not (q.availability <> 'any') or (case q.availability when 'current_only' then c.active and c.stock_status is distinct from 'Discontinued' when 'hide_unavailable' then c.active and c.stock_status is distinct from 'Discontinued' and c.stock_status is distinct from 'Special order' and not c.coming_soon when 'confirmed_in_stock' then c.active and c.stock_status in ('In stock', 'Low stock') else true end), false) as f_availability,
           coalesce(not (q.promo_only) or (c.promo_active), false) as f_promo
      from api.catalogue_staff c cross join q
  )
  select sku,
         product_name,
         brand,
         supplier,
         supplier_sku,
         category,
         material_type,
         colour_tone,
         grade,
         retail_price::float8 as retail_price,
         price_unit,
         price_on_request,
         promo_active,
         promo_end_date::text as promo_ends,
         last_price_update::text as price_as_of,
         price_list_url,
         cost::float8 as cost,
         map_price::float8 as map_price,
         pallet_price::float8 as pallet_price,
         promo_cost::float8 as promo_cost,
         rep_cost_active,
         rep_cost::float8 as rep_cost,
         rep_cost_end_date::text as rep_cost_end_date,
         rep_cost_note,
         volume_pricing_notes,
         salesperson_notes,
         internal_notes,
         stock_status,
         not active as archived,
         coming_soon,
         width_in::float8 as width_in,
         thickness_mm::float8 as thickness_mm,
         wear_layer_mil::float8 as wear_layer_mil,
         ac_rating,
         install_profile,
         box_size_sf::float8 as box_size_sf,
         waterproof as waterproof_confirmed,
         radiant_heat_compatible as radiant_heat_confirmed,
         pet_friendly as pet_friendly_confirmed,
         underpad_included,
         suitable_rooms,
         hero ->> 'thumb' as thumb_url,
         count(*) over () as total_matches
    from m
   where f_keyword and f_sku and f_categories and f_brand and f_suppliers and f_price and f_requires and f_room and f_colour and f_undertone and f_tone and f_width and f_wear_layer and f_install and f_availability and f_promo
   order by not active, (stock_status is not distinct from 'Discontinued'),
            case when sort = 'price_asc' then retail_price end asc nulls last,
            case when sort = 'price_desc' then retail_price end desc nulls last,
            rank desc, product_name, sku
   limit least(greatest(coalesce(p_lim, 5), 1), 10)
$fn$;

revoke execute on function api.askbert_search(text, text, text, text[], text, text[], numeric, numeric, text, boolean, boolean, boolean, boolean, text, text, text, int, int, numeric, numeric, numeric, text, text, boolean, text, int) from public, anon;
grant execute on function api.askbert_search(text, text, text, text[], text, text[], numeric, numeric, text, boolean, boolean, boolean, boolean, text, text, text, int, int, numeric, numeric, numeric, text, text, boolean, text, int) to authenticated;

alter table mirror.catalogue       drop column price_list_date;
alter table mirror.catalogue_stage drop column price_list_date;
