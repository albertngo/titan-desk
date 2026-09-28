-- 004: search cards carry the facts they show (Albert, 2026-09-28).
-- The result card now leads with the colour and shows spec chips and a per-box price, so
-- api.search_staff returns collection, width, thickness, wear layer, install profile,
-- waterproof and box size beside the columns it already had (appended last). All of them
-- are public-tier columns already exposed by api.catalogue_staff to the same role; no new
-- data reaches a new audience. api.search_public is unchanged.
-- A function's return type cannot be altered in place, so it is dropped and recreated with
-- the same body, grants and inlinability rules (no STRICT, no SET search_path, one SELECT).
-- Append-only: 001–003 are untouched.

drop function api.search_staff(text, text[], text[], numeric, numeric, boolean, boolean, boolean, boolean, text[], int, int, text[], text[], text[], int, int);

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
  coming_soon boolean, stock_status text, hero jsonb, total_count bigint, rank real, parsed jsonb,
  collection text, width_in numeric, thickness_mm numeric, wear_layer_mil numeric,
  install_profile text, waterproof boolean, box_size_sf numeric
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
         (select to_jsonb(p) - 'tsq' from p) as parsed,
         c.collection, c.width_in, c.thickness_mm, c.wear_layer_mil,
         c.install_profile, c.waterproof, c.box_size_sf
    from hits h
    join api.catalogue_staff c on c.sku = h.sku
   order by h.rank desc, c.product_name
$fn$;

revoke execute on function api.search_staff(text, text[], text[], numeric, numeric, boolean, boolean, boolean, boolean, text[], int, int, text[], text[], text[], int, int) from public;
grant execute on function api.search_staff(text, text[], text[], numeric, numeric, boolean, boolean, boolean, boolean, text[], int, int, text[], text[], text[], int, int) to authenticated;
