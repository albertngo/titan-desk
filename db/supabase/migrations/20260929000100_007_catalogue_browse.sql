-- 007: the browse screen (Albert, 2026-09-29). With the search box empty, the home page lists
-- Suppliers or Product types, and a tap drills down: supplier -> product type -> collections ->
-- product (or type -> supplier -> ...). The collections step is the grouped search (005) with
-- f_supplier/f_category set; this view gives the counts for the two steps before it.
--
-- One row per (supplier, category): how many products, and how many collections by the same key
-- api.search_staff_grouped groups on (supplier + the name before " — ", else the SKU), over the
-- same rows (every product, archived ones included), so a tile's count matches the list it opens.
-- Supplier is staff-tier, so the view is staff-only, like api.catalogue_facets.

create view api.catalogue_browse as
select c.supplier,
       c.category,
       count(*)::int as products,
       count(distinct case when position(' — ' in coalesce(c.product_name, '')) > 0
                           then split_part(c.product_name, ' — ', 1)
                           else 'sku|' || c.sku end)::int as collections
  from mirror.catalogue c
 where c.supplier is not null
   and c.category is not null
 group by c.supplier, c.category;

grant select on api.catalogue_browse to authenticated;
