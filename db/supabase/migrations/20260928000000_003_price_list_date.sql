-- 003: Price List Date (Albert, 2026-09-28).
-- Airtable gained `Price List Date` beside `Price List URL`: the date of the list the link points
-- to. Staff re-verify a product against its supplier's own list; when this date differs from
-- `last_price_update` (Airtable's Effective Date) the price was set from a different list than
-- the one linked, which is exactly what they should check. Staff tier, like the URL.
-- Append-only: 001 and 002 are untouched. The view is recreated with the column appended last
-- (create or replace view can only add columns at the end).

alter table mirror.catalogue       add column price_list_date date;
alter table mirror.catalogue_stage add column price_list_date date;

create or replace view api.catalogue_staff as
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
  c.search_staff,
  c.price_list_date
from mirror.catalogue c;
