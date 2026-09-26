-- 002: pricing semantics. No MAP floor (decision 2026-09-26); MAP never leaves the staff tier.
begin;
select plan(13);

insert into mirror.catalogue (airtable_record_id, airtable_modified_at, sku, product_name, product_type, category, retail_price, map_price, active) values
  ('t_map_above',  now(), 'T-MAP-ABOVE',  'map above retail',  'Flooring', 'LVP',   3.00, 3.50, true),
  ('t_map_below',  now(), 'T-MAP-BELOW',  'map below retail',  'Flooring', 'LVP',   4.00, 3.50, true),
  ('t_map_null',   now(), 'T-MAP-NULL',   'no map',            'Flooring', 'LVP',   4.00, null, true),
  ('t_ret_null',   now(), 'T-RET-NULL',   'no retail',         'Flooring', 'LVP',   null, 5.00, true),
  ('t_ret_zero',   now(), 'T-RET-ZERO',   'stone retail zero', 'Flooring', 'STONE', 0,    5.00, true),
  ('t_acc',        now(), 'T-ACC',        'accessory',         'Accessory', 'LVP', 25.00, null, true);

select is((select retail_price from api.catalogue_public where sku = 'T-MAP-ABOVE'), 3.00::numeric, 'public retail unchanged when map > retail (no floor)');
select is((select retail_price from api.catalogue_public where sku = 'T-MAP-BELOW'), 4.00::numeric, 'public retail unchanged when map < retail');
select is((select retail_price from api.catalogue_public where sku = 'T-MAP-NULL'),  4.00::numeric, 'public retail unchanged when map is null');
select is((select retail_price from api.catalogue_public where sku = 'T-RET-NULL'),  null::numeric, 'null retail stays null (never 0, never map)');
select is((select retail_price from api.catalogue_public where sku = 'T-RET-ZERO'),  null::numeric, 'retail 0 becomes null');
select ok((select price_on_request from api.catalogue_public where sku = 'T-RET-ZERO'), 'retail 0 → price_on_request');
select ok((select price_on_request from api.catalogue_public where sku = 'T-RET-NULL'), 'retail null → price_on_request');
select ok((select not price_on_request from api.catalogue_public where sku = 'T-MAP-ABOVE'), 'priced row is not price_on_request');

select is((select price_unit from api.catalogue_public where sku = 'T-RET-ZERO'), 'piece', 'STONE is priced per piece');
select is((select price_unit from api.catalogue_public where sku = 'T-ACC'),      'piece', 'accessories are priced per piece');
select is((select price_unit from api.catalogue_public where sku = 'T-MAP-ABOVE'),'sf',    'flooring is priced per sq ft');

-- staff sees raw retail and map side by side; public has no map column at all
select is((select map_price from api.catalogue_staff where sku = 'T-MAP-ABOVE'), 3.50::numeric, 'staff view exposes map_price');
select hasnt_column('api', 'catalogue_public', 'map_price', 'public view has no map_price column');

select * from finish();
rollback;
