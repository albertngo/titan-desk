-- 006: exact column lists of both views. Any drift is a deliberate, reviewed change:
-- update this test, db/README.md's tier table, and 007 together.
begin;
select plan(2);

select is(
  (select array_agg(column_name::text order by ordinal_position) from information_schema.columns where table_schema = 'api' and table_name = 'catalogue_public'),
  array[
    'sku','product_name','brand','collection','product_type','category','material_type',
    'species','colour_tone','grade','layout_pattern',
    'width_in','length','thickness_mm','wear_layer_mil','veneer_mm','veneer_cut_type','ac_rating',
    'finish_type','install_profile','install_method','locking_system','underpad_included','underpad_type',
    'iic_rating','stc_rating','tile_format','weight_per_piece_kg','certifications',
    'retail_price','price_on_request','price_unit','promo_active',
    'box_size_sf','pieces_per_box','stock_status','coming_soon',
    'waterproof','pet_friendly','radiant_heat_compatible','traffic_rating','suitable_rooms',
    'residential_warranty_yrs','commercial_warranty_yrs',
    'undertone','tone_depth','texture','style','busyness',
    'pairs_well_with','variants','images','hero','search_public'
  ]::text[],
  'api.catalogue_public columns are exactly the public tier');

select is(
  (select array_agg(column_name::text order by ordinal_position) from information_schema.columns where table_schema = 'api' and table_name = 'catalogue_staff'),
  array[
    'sku','product_name','brand','collection','product_type','category','material_type',
    'species','colour_tone','grade','layout_pattern',
    'width_in','length','thickness_mm','wear_layer_mil','veneer_mm','veneer_cut_type','ac_rating',
    'finish_type','install_profile','install_method','locking_system','underpad_included','underpad_type',
    'iic_rating','stc_rating','tile_format','weight_per_piece_kg','certifications',
    'retail_price','price_on_request','price_unit','promo_active',
    'box_size_sf','pieces_per_box','stock_status','coming_soon',
    'waterproof','pet_friendly','radiant_heat_compatible','traffic_rating','suitable_rooms',
    'residential_warranty_yrs','commercial_warranty_yrs',
    'undertone','tone_depth','texture','style','busyness',
    'supplier','supplier_sku','cost','map_price','pallet_price','promo_cost','promo_end_date',
    'volume_pricing_notes','last_price_update','price_last_changed_by','price_stale','promo_open_ended',
    'boxes_per_skid','pieces_per_pallet','active',
    'salesperson_notes','internal_notes','price_list_url',
    'promo_list_url','rep_cost','rep_cost_end_date','rep_cost_note','rep_cost_active',
    'style_tags_status','style_tags_evidence','airtable_url',
    'pairs_well_with','variants','images','hero','search_staff','price_list_date'
  ]::text[],
  'api.catalogue_staff columns are exactly public + staff tiers');

select * from finish();
rollback;
