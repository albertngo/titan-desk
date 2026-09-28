-- 005: search results grouped by collection (Albert, 2026-09-28).
-- A search for "purelux" returned 129 cards, nine of them the same Betten Laminate in nine
-- colours. api.search_staff_grouped runs the same match, filters and ranking as
-- api.search_staff (migration 004) and folds the hits into one row per product line, with the
-- colours inside, paging by line. Grouping happens here, not in the browser, so a collection
-- is never split across pages and its colour count is always complete.
--
-- A product's line is the part of its name before " — " (the catalogue's naming rule:
-- "Line — Colour (grade)", tile "Series — Colour — Size (finish)"), within one supplier. A name
-- without " — " is its own group of one, shown as a normal card.
-- Columns returned are the ones api.search_staff already returns to the same role (staff);
-- nothing reaches a new audience. Inlinability rules as for 004: no STRICT, no SET search_path.

create function api.search_staff_grouped(
  q text default '',
  f_supplier text[] default null, f_category text[] default null,
  f_price_min numeric default null, f_price_max numeric default null,
  f_waterproof boolean default null, f_radiant boolean default null, f_pet boolean default null,
  f_hide_unavailable boolean default false,
  f_undertone text[] default null, f_tone_depth_min int default null, f_tone_depth_max int default null,
  f_texture text[] default null, f_style text[] default null, f_busyness text[] default null,
  lim int default 20, off int default 0
) returns table (
  group_key text, line text, brand text, supplier text, category text,
  product_count int, price_min numeric, price_max numeric, price_unit text, any_promo boolean,
  width_in numeric, thickness_mm numeric, wear_layer_mil numeric, install_profile text, waterproof boolean,
  members jsonb, total_groups bigint, total_products bigint, rank real, parsed jsonb
)
language sql stable parallel safe as $fn$
  with p as (select * from api.parse_query(q)),
  matched as (
    select c.sku, c.product_name, c.brand, c.category, c.supplier, c.collection,
           c.retail_price, c.price_unit, c.price_on_request, c.promo_active, c.coming_soon, c.stock_status,
           c.hero, c.width_in, c.thickness_mm, c.wear_layer_mil, c.install_profile, c.waterproof, c.box_size_sf,
           case when position(' — ' in coalesce(c.product_name, '')) > 0
                then coalesce(c.supplier, '') || '|' || split_part(c.product_name, ' — ', 1)
                else 'sku|' || c.sku end as group_key,
           case when position(' — ' in coalesce(c.product_name, '')) > 0
                then split_part(c.product_name, ' — ', 1) end as line,
           (case when p.tsq is null then 0 else ts_rank_cd(c.search_staff, p.tsq, 32) end
            + case when p.free_text = '' then 0 else extensions.word_similarity(p.free_text, c.product_name) end)::real as rank
      from api.catalogue_staff c, p
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
  )
  select m.group_key,
         min(m.line),
         min(m.brand), min(m.supplier), min(m.category),
         count(*)::int,
         min(m.retail_price) filter (where not m.price_on_request),
         max(m.retail_price) filter (where not m.price_on_request),
         min(m.price_unit),
         bool_or(m.promo_active),
         -- a spec shown on the group only when every product in it shares it
         case when min(m.width_in) = max(m.width_in) and count(m.width_in) = count(*) then min(m.width_in) end,
         case when min(m.thickness_mm) = max(m.thickness_mm) and count(m.thickness_mm) = count(*) then min(m.thickness_mm) end,
         case when min(m.wear_layer_mil) = max(m.wear_layer_mil) and count(m.wear_layer_mil) = count(*) then min(m.wear_layer_mil) end,
         case when count(distinct m.install_profile) = 1 and count(m.install_profile) = count(*) then min(m.install_profile) end,
         bool_and(m.waterproof),
         jsonb_agg(jsonb_build_object(
             'sku', m.sku, 'product_name', m.product_name, 'brand', m.brand, 'category', m.category,
             'supplier', m.supplier, 'collection', m.collection,
             'retail_price', m.retail_price, 'price_unit', m.price_unit, 'price_on_request', m.price_on_request,
             'promo_active', m.promo_active, 'coming_soon', m.coming_soon, 'stock_status', m.stock_status,
             'hero', m.hero, 'width_in', m.width_in, 'thickness_mm', m.thickness_mm,
             'wear_layer_mil', m.wear_layer_mil, 'install_profile', m.install_profile,
             'waterproof', m.waterproof, 'box_size_sf', m.box_size_sf)
           order by m.product_name, m.sku),
         count(*) over (),
         sum(count(*)) over (),
         max(m.rank),
         (select to_jsonb(p) - 'tsq' from p)
    from matched m
   group by m.group_key
   order by max(m.rank) desc, min(m.line) nulls last, min(m.product_name)
   limit least(greatest(coalesce(lim, 20), 1), 50) offset greatest(coalesce(off, 0), 0)
$fn$;

revoke execute on function api.search_staff_grouped(text, text[], text[], numeric, numeric, boolean, boolean, boolean, boolean, text[], int, int, text[], text[], text[], int, int) from public;
grant execute on function api.search_staff_grouped(text, text[], text[], numeric, numeric, boolean, boolean, boolean, boolean, text[], int, int, text[], text[], text[], int, int) to authenticated;
