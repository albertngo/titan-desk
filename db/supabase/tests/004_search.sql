-- 004: parse_query token table and the ranked search functions.
begin;
-- start from an empty catalogue: seed rows must not influence these assertions
delete from mirror.catalogue_images;
delete from mirror.catalogue;
select plan(40);

-- parse_query --------------------------------------------------------------
select is((select width_in from api.parse_query('what is 6in click on promo')), 6::numeric, '6in → width 6');
select is((select install_profile from api.parse_query('what is 6in click on promo')), 'Click', 'click → Click');
select ok((select promo from api.parse_query('what is 6in click on promo')), 'on promo → promo');
select is((select free_text from api.parse_query('what is 6in click on promo')), '', 'filler stripped; nothing left as free text');
select is((select width_in from api.parse_query('6.5 inch')), 6.5::numeric, '6.5 inch → width 6.5');
select is((select width_in from api.parse_query('7"')), 7::numeric, '7" → width 7');
select is((select thickness_mm from api.parse_query('12mm laminate')), 12::numeric, '12mm → thickness, not width');
select is((select width_in from api.parse_query('12mm laminate')), null::numeric, '12mm is not a width');
select is((select category_in from api.parse_query('12mm laminate')), array['Laminate'], 'laminate → category');
select is((select category_in from api.parse_query('waterproof 7 inch vinyl under $4')), array['LVP', 'LVT'], 'vinyl → LVP + LVT');
select is((select price_max from api.parse_query('waterproof 7 inch vinyl under $4')), 4::numeric, 'under $4 → price_max');
select ok((select waterproof from api.parse_query('waterproof 7 inch vinyl under $4')), 'waterproof flag');
select is((select price_min from api.parse_query('oak over $5')), 5::numeric, 'over $5 → price_min');
select is((select install_profile from api.parse_query('nail down oak')), 'T&G', 'nail down → T&G');
select is((select category_in from api.parse_query('hardwood')), array['Engineered hardwood', 'Solid hardwood'], 'hardwood → both hardwood categories');
select ok((select clearance from api.parse_query('clearance tile')), 'clearance flag');
select ok((select pet from api.parse_query('pet friendly')), 'pet friendly flag');
select ok((select radiant from api.parse_query('heated floor')), 'heated floor → radiant');
select is((select free_text from api.parse_query('Vidar''s (macaroon) & oak?')), 'vidar''s macaroon & oak', 'punctuation-safe free text');
select lives_ok($$select tsq from api.parse_query('Vidar''s (macaroon) & oak?')$$, 'apostrophes, parentheses and & never break the tsquery');
select lives_ok($$select tsq from api.parse_query('what is')$$, 'filler-only query yields no tsquery, no error');
select is((select tsq from api.parse_query('show me the')), null::tsquery, 'filler-only → null tsquery (browse)');
select is((select tsq::text from api.parse_query('macar oak')), $$'macar':* & 'oak':*$$, 'prefix tsquery from lexemes');
select is((select free_text from api.parse_query('light oak')), 'light oak', 'style words are kept as free text, not stripped');

-- search fixtures -------------------------------------------------------------
insert into mirror.catalogue (airtable_record_id, airtable_modified_at, sku, product_name, brand, supplier, supplier_sku, product_type, category, material_type, species, colour_tone, grade,
                              width_in, thickness_mm, install_profile, finish_type, retail_price, promo_cost, promo_end_date, stock_status, active, waterproof, pet_friendly, tone_depth, texture, salesperson_notes) values
  ('s1', now(), 'ENG-VIDR-0042', 'Vidar 7.5" AWO — Macaroon (Character)', 'Vidar', 'VIDAR', null, 'Flooring', 'Engineered hardwood', 'Hardwood plywood', 'American White Oak', 'Light', 'Character', 7.5, 14, 'T&G', 'Wire brushed', 5.79, null, null, null, true, false, false, 2, 'Brushed', null),
  ('s2', now(), 'GRNDSPC-0001', 'Grandeur Enduro 6" SPC — Harbour Grey', 'Grandeur', 'GRANDEUR', 'GR-EN-HG6', 'Flooring', 'LVP', 'SPC core', null, 'Grey', null, 6, 6.5, 'Click', 'Embossed', 3.19, 1.99, api.today() + 5, null, true, true, true, 3, 'Smooth', null),
  ('s3', now(), 'ENG-VIDR-0200', 'Vidar 6" EWO — Whistler (Select & Better)', 'Vidar', 'VIDAR', null, 'Flooring', 'Engineered hardwood', 'Hardwood plywood', 'European White Oak', 'Natural', 'Select & Better', 6, 12.7, 'Click', 'Matte UV', 5.29, 3.99, null, null, true, false, false, 2, 'Smooth', null),
  ('s4', now(), 'ENG-CANS-0001', 'BOEN Chaletino 12" Oak — Vintage White', 'BOEN', 'CANADIAN STANDARD', 'CS-CH-VW', 'Flooring', 'Engineered hardwood', 'Hardwood plywood', 'European White Oak', 'White', 'Character', 12, 20, 'T&G', 'Oiled', 10.90, null, null, 'Special order', true, false, false, 1, 'Brushed', null),
  ('s5', now(), 'LVP-BIYK-BYKHYDRO7WI', 'Biyork Hydrogen 7 — Winter Fog', 'Biyork', 'BIYORK', 'BYKHYDRO7WI', 'Flooring', 'LVP', 'SPC core', null, 'Grey', null, 7, 7, 'Click', 'Embossed', 3.63, null, null, 'In stock', true, true, true, 3, 'Smooth', null),
  ('s6', now(), 'LAM-FAWK-0042', 'NAF 12mm Waterproof Laminate 7.71" — Harrison', 'NAF', 'FLOORS AT WORK', null, 'Flooring', 'Laminate', 'Water-Resistant Core', null, 'Medium', null, 7.71, 12, 'Click', 'Embossed', 2.99, null, null, null, true, true, false, null, null, 'COMING SOON — not yet in stock.'),
  ('s7', now(), 'ENG-VIDR-0100R', 'Vidar 7.5" AWO — Macaroon (Rustic)', 'Vidar', 'VIDAR', null, 'Flooring', 'Engineered hardwood', 'Hardwood plywood', 'American White Oak', 'Light', 'Rustic', 7.5, 14, 'T&G', 'Wire brushed', 4.99, null, null, 'Discontinued', true, false, false, null, null, null);

-- matching ---------------------------------------------------------------------------
select is((select array_agg(sku order by sku) from api.search_staff('6in click on promo')), array['GRNDSPC-0001'], '"6in click on promo" → only the 6" click product with an active promo');
select ok('ENG-VIDR-0042' = any (select sku from api.search_staff('macar')), 'prefix "macar" finds Macaroon');
select ok('ENG-VIDR-0042' = any (select sku from api.search_staff('VIDR-0042')), 'SKU fragment finds by ILIKE');
select ok('ENG-VIDR-0042' = any (select sku from api.search_staff('macarron')), 'typo "macarron" finds Macaroon via word similarity against a long name');
select is((select array_agg(sku) from api.search_staff('canadian standard')), array['ENG-CANS-0001'], 'supplier name (≠ brand) matches in staff search');
select is((select count(*) from api.search_public('canadian standard')), 0::bigint, 'supplier name does not match in public search');
select is((select array_agg(sku) from api.search_staff('CS-CH-VW')), array['ENG-CANS-0001'], 'supplier_sku matches in staff search only');
select is((select count(*) from api.search_public('CS-CH-VW')), 0::bigint, 'supplier_sku does not match in public search');
select is((select array_agg(sku) from api.search_staff('waterproof 7 inch vinyl under $4')), array['LVP-BIYK-BYKHYDRO7WI'], 'width + waterproof + category + price combine');
select is((select array_agg(sku order by sku) from api.search_staff('12mm laminate')), array['LAM-FAWK-0042'], 'thickness + category');
select ok(not ('ENG-VIDR-0100R' = any (select sku from api.search_public('macaroon'))), 'public search never returns a discontinued row');
select ok('ENG-VIDR-0100R' = any (select sku from api.search_staff('macaroon')), 'staff search returns discontinued rows');
select is((select count(*) from api.search_staff('', f_hide_unavailable => true)), 4::bigint, 'hide_unavailable drops special order, discontinued and coming soon');
select is((select total_count from api.search_staff('', f_supplier => array['VIDAR'], lim => 1) limit 1), 3::bigint, 'total_count counts all matches regardless of lim');
select is((select (parsed ->> 'width_in')::numeric from api.search_staff('6in click on promo') limit 1), 6::numeric, 'parsed tokens are returned for chips');

-- indexability: with seq scans disabled the OR-ed predicates use the GIN indexes
create function pg_temp.explain_search(q text) returns setof text language plpgsql as $t$
declare l text;
begin
  for l in execute format('explain (costs off) select * from api.search_staff(%L)', q) loop
    return next l;
  end loop;
end $t$;
set local enable_seqscan = off;
select ok(exists (select 1 from pg_temp.explain_search('macar') l where l ~ 'Bitmap Index Scan on catalogue_search_staff_gin'),
  'search predicates are served by the tsvector GIN index');
reset enable_seqscan;

select * from finish();
rollback;
