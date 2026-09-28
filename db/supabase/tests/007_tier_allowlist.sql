-- 007: policy, not snapshot. The public view may only contain allow-listed columns and must
-- contain nothing from the staff or system tiers. Lists mirror db/README.md.
begin;
select plan(4);

create temp table tier (tier text, col text);
insert into tier values
  -- staff-only
  ('staff','supplier'),('staff','supplier_sku'),('staff','cost'),('staff','map_price'),('staff','pallet_price'),
  ('staff','promo_cost'),('staff','promo_end_date'),('staff','volume_pricing_notes'),('staff','last_price_update'),
  ('staff','price_last_changed_by'),('staff','price_stale'),('staff','promo_open_ended'),('staff','boxes_per_skid'),
  ('staff','pieces_per_pallet'),('staff','active'),('staff','salesperson_notes'),('staff','internal_notes'),
  ('staff','price_list_url'),('staff','price_list_date'),('staff','promo_list_url'),('staff','rep_cost'),('staff','rep_cost_end_date'),('staff','rep_cost_note'),('staff','rep_cost_active'),
  ('staff','style_tags_status'),('staff','style_tags_evidence'),('staff','airtable_url'),('staff','search_staff'),
  -- system-only (base table)
  ('system','airtable_record_id'),('system','airtable_created_at'),('system','airtable_modified_at'),('system','synced_at'),
  ('system','lightspeed_id'),('system','ls_handle'),('system','variant_group'),('system','image_attachments'),
  -- public allow-list
  ('public','sku'),('public','product_name'),('public','brand'),('public','collection'),('public','product_type'),('public','category'),
  ('public','material_type'),('public','species'),('public','colour_tone'),('public','grade'),('public','layout_pattern'),
  ('public','width_in'),('public','length'),('public','thickness_mm'),('public','wear_layer_mil'),('public','veneer_mm'),
  ('public','veneer_cut_type'),('public','ac_rating'),('public','finish_type'),('public','install_profile'),('public','install_method'),
  ('public','locking_system'),('public','underpad_included'),('public','underpad_type'),('public','iic_rating'),('public','stc_rating'),
  ('public','tile_format'),('public','weight_per_piece_kg'),('public','certifications'),('public','retail_price'),('public','price_on_request'),
  ('public','price_unit'),('public','promo_active'),('public','box_size_sf'),('public','pieces_per_box'),('public','stock_status'),
  ('public','coming_soon'),('public','waterproof'),('public','pet_friendly'),('public','radiant_heat_compatible'),('public','traffic_rating'),
  ('public','suitable_rooms'),('public','residential_warranty_yrs'),('public','commercial_warranty_yrs'),
  ('public','undertone'),('public','tone_depth'),('public','texture'),('public','style'),('public','busyness'),
  ('public','pairs_well_with'),('public','variants'),('public','images'),('public','hero'),('public','search_public');

select is(
  (select array_agg(column_name::text order by column_name) from information_schema.columns
    where table_schema = 'api' and table_name = 'catalogue_public'
      and column_name not in (select col from tier where tier = 'public')),
  null::text[],
  'public view has no column outside the public allow-list');

select is(
  (select array_agg(column_name::text order by column_name) from information_schema.columns
    where table_schema = 'api' and table_name = 'catalogue_public'
      and column_name in (select col from tier where tier in ('staff', 'system'))),
  null::text[],
  'public view contains no staff or system column');

-- every base-table column is classified somewhere (a new column must be tiered)
select is(
  (select array_agg(column_name::text order by column_name) from information_schema.columns
    where table_schema = 'mirror' and table_name = 'catalogue'
      and column_name not in (select col from tier)
      and column_name not in ('search_public')),
  null::text[],
  'every mirror.catalogue column is tiered (public/staff/system)');

-- images JSON never leaks storage paths in either view
select ok(
  not exists (
    select 1 from api.catalogue_staff, jsonb_array_elements(coalesce(images, '[]'::jsonb)) e
     where e ? 'original_path' or e ? 'master_jpg_path' or e ? 'source_hash'),
  'images JSON carries no original_path / master_jpg_path / source_hash');

select * from finish();
rollback;
