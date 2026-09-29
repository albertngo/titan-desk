-- 011: the browse screen's counts (migration 007). Staff-only, and every tile's numbers match
-- the grouped search it opens.
begin;
select plan(6);

select ok(has_table_privilege('authenticated', 'api.catalogue_browse', 'SELECT'), 'staff can read catalogue_browse');
select ok(not has_table_privilege('anon', 'api.catalogue_browse', 'SELECT'), 'anon cannot read catalogue_browse (supplier is staff-tier)');

select is(
  (select array_agg(column_name::text order by ordinal_position) from information_schema.columns
    where table_schema = 'api' and table_name = 'catalogue_browse'),
  array['supplier','category','products','collections']::text[],
  'catalogue_browse columns');

set local role authenticated;

select is((select sum(products)::int from api.catalogue_browse),
          (select count(*)::int from api.catalogue_staff where supplier is not null and category is not null),
          'every product with a supplier and category is counted once');

select is((select collections from api.catalogue_browse where supplier = 'VIDAR' and category = 'Engineered hardwood'), 5,
          'colours of one line count as one collection');

-- the counts on every tile equal what the grouped search then lists
select is(
  (select count(*)::int
     from api.catalogue_browse b
     cross join lateral (
       select g.total_products::int as products, g.total_groups::int as collections
         from api.search_staff_grouped(f_supplier => array[b.supplier], f_category => array[b.category]) g
        limit 1) s
    where (b.products, b.collections) is distinct from (s.products, s.collections)),
  0,
  'each (supplier, category) tile matches search_staff_grouped''s totals');

reset role;
select * from finish();
rollback;
