-- 003: row filter and computed columns (promo, stale, coming soon, variants, pairs, images).
-- Dates use api.today() (Toronto), the same clock the views use; current_date is the session's UTC date
-- and is a day ahead every evening, which made the 90-day boundary test fail after 8 pm Toronto.
begin;
-- start from an empty catalogue: seed rows must not influence these assertions
delete from mirror.catalogue_images;
delete from mirror.catalogue;
select plan(34);

-- fixtures ---------------------------------------------------------------
insert into mirror.catalogue (airtable_record_id, airtable_modified_at, sku, product_name, product_type, category, grade, width_in, length, finish_type,
                              ls_handle, retail_price, promo_cost, promo_end_date, last_price_update, stock_status, active, salesperson_notes, pairs_well_with) values
  ('t_active',    now(), 'T-ACT',   'active plain',            'Flooring', 'LVP', null, 6, '48"', null, null, 3.00, null, null, api.today() - 10, null, true, null, 'T-PAIR-OK, T-PAIR-DISC; T-PAIR-MISSING'),
  ('t_inactive',  now(), 'T-INACT', 'inactive',                'Flooring', 'LVP', null, 6, null, null, null, 3.00, null, null, null, null, false, null, null),
  ('t_disc',      now(), 'T-DISC',  'discontinued',            'Flooring', 'LVP', null, 6, null, null, null, 3.00, null, null, null, 'Discontinued', true, null, null),
  ('t_clear',     now(), 'T-CLEAR', 'clearance stays public',  'Flooring', 'LVP', null, 6, null, null, null, 3.00, null, null, null, 'Clearance', true, null, null),
  ('t_promo_on',  now(), 'T-PROMO-ON',  'promo active',        'Flooring', 'LVP', null, 6, null, null, null, 3.00, 2.50, api.today(), api.today(), null, true, null, null),
  ('t_promo_off', now(), 'T-PROMO-OFF', 'promo expired',       'Flooring', 'LVP', null, 6, null, null, null, 3.00, 2.50, api.today() - 1, api.today(), null, true, null, null),
  ('t_promo_open',now(), 'T-PROMO-OPEN','promo no end date',   'Flooring', 'LVP', null, 6, null, null, null, 3.00, 2.50, null, api.today() - 91, null, true, null, null),
  ('t_coming',    now(), 'T-COMING', 'coming soon item',       'Flooring', 'LVP', null, 6, null, null, null, 3.00, null, null, null, null, true, '  COMING SOON — not yet in stock.', null),
  ('t_notes',     now(), 'T-NOTES',  'notes but not coming',   'Flooring', 'LVP', null, 6, null, null, null, 3.00, null, null, null, null, true, 'Best seller. Coming soon: nothing.', null),
  ('t_pair_ok',   now(), 'T-PAIR-OK',   'pair ok',             'Accessory', 'LVP', null, null, null, null, null, 10, null, null, null, null, true, null, null),
  ('t_pair_disc', now(), 'T-PAIR-DISC', 'pair discontinued',   'Accessory', 'LVP', null, null, null, null, null, 10, null, null, null, 'Discontinued', true, null, null),
  -- variant group with grades
  ('t_v_char',    now(), 'T-V-CHAR', 'Group A (Character)',    'Flooring', 'Engineered hardwood', 'Character', 7.5, '72"', 'Wire brushed', 'GROUPA', 5, null, null, null, null, true, null, null),
  ('t_v_sel',     now(), 'T-V-SEL',  'Group A (Select)',       'Flooring', 'Engineered hardwood', 'Select',    7.5, '72"', 'Wire brushed', 'groupa', 6, null, null, null, null, true, null, null),
  ('t_v_rus',     now(), 'T-V-RUS',  'Group A (Rustic)',       'Flooring', 'Engineered hardwood', 'Rustic',    7.5, '72"', 'Wire brushed', 'GROUPA', 4, null, null, null, 'Discontinued', true, null, null),
  -- tile variant group: no grade, sizes differ
  ('t_t_12',      now(), 'T-T-12',   'Aldo — Bianco — 12 x 24','Flooring', 'Tile / Stone', null, 12, '24"', 'Matte', 'TILEA', 4, null, null, null, null, true, null, null),
  ('t_t_24',      now(), 'T-T-24',   'Aldo — Bianco — 24 x 24','Flooring', 'Tile / Stone', null, 24, '24"', 'Matte', 'TILEA', 5, null, null, null, null, true, null, null);

-- row filter ----------------------------------------------------------------
select ok(exists (select 1 from api.catalogue_public where sku = 'T-ACT'),      'active row is public');
select ok(not exists (select 1 from api.catalogue_public where sku = 'T-INACT'),'inactive row is hidden from public');
select ok(not exists (select 1 from api.catalogue_public where sku = 'T-DISC'), 'discontinued row is hidden from public');
select ok(exists (select 1 from api.catalogue_public where sku = 'T-CLEAR'),    'clearance row stays public');
select ok(exists (select 1 from api.catalogue_staff where sku = 'T-INACT'),     'staff sees inactive rows');
select ok(exists (select 1 from api.catalogue_staff where sku = 'T-DISC'),      'staff sees discontinued rows');

-- promo (strict) ------------------------------------------------------------
select ok((select promo_active from api.catalogue_public where sku = 'T-PROMO-ON'),        'promo ending today is active');
select ok((select not promo_active from api.catalogue_public where sku = 'T-PROMO-OFF'),   'promo ended yesterday is inactive');
select ok((select not promo_active from api.catalogue_public where sku = 'T-PROMO-OPEN'),  'promo with no end date is inactive (strict)');
select ok((select promo_active is not null from api.catalogue_public where sku = 'T-ACT'), 'promo_active is never null');
select ok((select promo_open_ended from api.catalogue_staff where sku = 'T-PROMO-OPEN'),   'staff sees promo_open_ended');
select ok((select not promo_open_ended from api.catalogue_staff where sku = 'T-PROMO-ON'), 'dated promo is not open-ended');

-- rep cost (NULL end date = ongoing, the opposite of the promo rule) --------------
update mirror.catalogue set rep_cost = 2.10, rep_cost_end_date = null           where sku = 'T-ACT';
update mirror.catalogue set rep_cost = 2.10, rep_cost_end_date = api.today()    where sku = 'T-PROMO-ON';
update mirror.catalogue set rep_cost = 2.10, rep_cost_end_date = api.today() - 1 where sku = 'T-PROMO-OFF';
select ok((select rep_cost_active from api.catalogue_staff where sku = 'T-ACT'),           'rep cost with no end date is ongoing');
select ok((select rep_cost_active from api.catalogue_staff where sku = 'T-PROMO-ON'),      'rep cost ending today is active');
select ok((select not rep_cost_active from api.catalogue_staff where sku = 'T-PROMO-OFF'), 'rep cost ended yesterday is inactive');
select ok((select not rep_cost_active from api.catalogue_staff where sku = 'T-INACT'),     'no rep cost → false, never null');

-- stale -----------------------------------------------------------------------
select ok((select price_stale from api.catalogue_staff where sku = 'T-INACT'),       'null last_price_update is stale');
select ok((select price_stale from api.catalogue_staff where sku = 'T-PROMO-OPEN'),  '91 days old is stale');
select ok((select not price_stale from api.catalogue_staff where sku = 'T-ACT'),     '10 days old is fresh');

-- coming soon -----------------------------------------------------------------
select ok((select coming_soon from api.catalogue_public where sku = 'T-COMING'),         'COMING SOON first line sets coming_soon');
select ok((select not coming_soon from api.catalogue_public where sku = 'T-NOTES'),      'coming soon elsewhere in notes does not');
select ok((select coming_soon is false from api.catalogue_public where sku = 'T-ACT'),   'no notes → coming_soon false, not null');
select hasnt_column('api', 'catalogue_public', 'salesperson_notes', 'public view never exposes salesperson_notes');

-- variants ---------------------------------------------------------------------
select is((select jsonb_array_length(variants) from api.catalogue_public where sku = 'T-V-CHAR'), 1, 'public variants exclude self and discontinued sibling');
select is((select variants -> 0 ->> 'sku' from api.catalogue_public where sku = 'T-V-CHAR'), 'T-V-SEL', 'ls_handle case differences still group (upper)');
select is((select jsonb_array_length(variants) from api.catalogue_staff where sku = 'T-V-CHAR'), 2, 'staff variants include the discontinued sibling');
select is((select variants -> 0 ->> 'variant_label' from api.catalogue_public where sku = 'T-V-CHAR'), 'Select', 'variant_label is the grade when present');
select is((select variants -> 0 ->> 'variant_label' from api.catalogue_public where sku = 'T-T-12'), '24" × 24"', 'variant_label falls back to size for graded-less tile');
select ok((select variants is null from api.catalogue_public where sku = 'T-ACT'), 'no ls_handle → no variants');

-- pairs -------------------------------------------------------------------------
select is((select jsonb_array_length(pairs_well_with) from api.catalogue_public where sku = 'T-ACT'), 1, 'public pairs drop discontinued and unknown SKUs');
select is((select jsonb_array_length(pairs_well_with) from api.catalogue_staff  where sku = 'T-ACT'), 2, 'staff pairs keep the discontinued one, drop unknown');

-- images ---------------------------------------------------------------------------
insert into mirror.catalogue_images (airtable_record_id, sku, kind, airtable_attachment_id, sort_order, source_hash, original_path, original_mime, original_bytes,
                                     low_res, variant_paths, width, height, blurhash, encoder_version, public_base_url, deleted_at) values
  ('t_active', 'T-ACT', 'detail', 'att1', 0, 'h1', 'p/h1.jpg', 'image/jpeg', 1, false,
   '{"200": {"path": "p/h1_200.webp", "w": 200, "h": 100}, "600": {"path": "p/h1_600.webp"}, "1600": {"path": "p/h1_1600.webp"}}', 1600, 800, 'bh1', 3, 'https://x/cat', null),
  ('t_active', 'T-ACT', 'swatch', 'att2', 0, 'h2', 'p/h2.jpg', 'image/jpeg', 1, true,
   '{"200": {"path": "p/h2_200.webp"}, "600": {"path": "p/h2_600.webp"}, "1600": {"path": "p/h2_1600.webp"}}', 800, 800, 'bh2', 3, 'https://x/cat', null),
  ('t_active', 'T-ACT', 'room', 'att3', 0, 'h3', 'p/h3.jpg', 'image/jpeg', 1, false,
   '{"200": {"path": "p/h3_200.webp"}, "600": {"path": "p/h3_600.webp"}, "1600": {"path": "p/h3_1600.webp"}}', 1600, 1200, 'bh3', 3, 'https://x/cat', now());

select is((select jsonb_array_length(images) from api.catalogue_public where sku = 'T-ACT'), 2, 'soft-deleted image is excluded');
select is((select images -> 0 ->> 'kind' from api.catalogue_public where sku = 'T-ACT'), 'swatch', 'images ordered swatch → room → detail');
select is((select images -> 0 ->> 'thumb' from api.catalogue_public where sku = 'T-ACT'), 'https://x/cat/p/h2_200.webp?v=3', 'URLs are fully formed and carry ?v=encoder_version');

select * from finish();
rollback;
