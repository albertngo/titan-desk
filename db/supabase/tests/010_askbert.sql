-- 010: askBert's data boundary. The assistant reads askbert.catalogue as askbert_reader and
-- nothing else; cost, margin and internal pricing are not in the view. Lists mirror the
-- "askBert tier" in db/README.md. Privileges are checked with has_*_privilege (the test
-- runner cannot always SET ROLE to a role it did not grant itself).
begin;
select plan(16);

-- 1. exact columns, in order
select is(
  (select array_agg(column_name::text order by ordinal_position) from information_schema.columns
    where table_schema = 'askbert' and table_name = 'catalogue'),
  array[
    'sku','product_name','brand','supplier','collection','product_type','category',
    'material_type','species','colour_tone','grade','layout_pattern',
    'width_in','length','thickness_mm','wear_layer_mil','veneer_mm','ac_rating',
    'finish_type','install_profile','install_method','locking_system',
    'underpad_included','underpad_type','iic_rating','stc_rating','tile_format',
    'box_size_sf','pieces_per_box',
    'retail_price','price_on_request','price_unit','promo_active','promo_ends','price_as_of','price_list_date',
    'stock_status','archived','coming_soon',
    'waterproof_confirmed','pet_friendly_confirmed','radiant_heat_confirmed',
    'traffic_rating','suitable_rooms','residential_warranty_yrs','commercial_warranty_yrs',
    'undertone','tone_depth','texture','style','busyness',
    'thumb_url','search_public'
  ]::text[],
  'askbert.catalogue has exactly the askBert-tier columns');

-- 2. nothing from the excluded list, under any name
select is(
  (select array_agg(column_name::text order by column_name) from information_schema.columns
    where table_schema = 'askbert' and table_name = 'catalogue'
      and column_name in (
        'cost','map_price','pallet_price','promo_cost','volume_pricing_notes',
        'rep_cost','rep_cost_end_date','rep_cost_note','rep_cost_active','price_last_changed_by',
        'price_stale','promo_open_ended','price_list_url','promo_list_url','supplier_sku',
        'internal_notes','salesperson_notes','boxes_per_skid','pieces_per_pallet',
        'style_tags_status','style_tags_evidence','search_staff','airtable_url',
        'airtable_record_id','airtable_created_at','airtable_modified_at','synced_at',
        'lightspeed_id','ls_handle','variant_group','image_attachments','images','hero')),
  null::text[],
  'askbert.catalogue has no cost, internal-pricing, notes or system column');

select throws_ok($$select cost from askbert.catalogue$$, '42703', null, 'cost is not a column of askbert.catalogue');
select throws_ok($$select margin from askbert.catalogue$$, '42703', null, 'margin is not a column of askbert.catalogue');

-- 3. the role can read exactly one relation, anywhere outside the system catalogs
select is(
  (select array_agg(n.nspname || '.' || c.relname order by 1)
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where c.relkind in ('r','v','m','p','f')
      and n.nspname not in ('pg_catalog','information_schema','tap') -- tap: the local pgTAP shim's own state
      and n.nspname not like 'pg_toast%' and n.nspname not like 'pg_temp%'
      and has_schema_privilege('askbert_reader', n.oid, 'USAGE')
      and has_table_privilege('askbert_reader', c.oid, 'SELECT')),
  array['askbert.catalogue']::text[],
  'askbert_reader can reach (schema USAGE + SELECT) askbert.catalogue and nothing else');

select ok(not has_table_privilege('askbert_reader', 'mirror.catalogue', 'SELECT'), 'askbert_reader cannot read mirror.catalogue');
select ok(not has_table_privilege('askbert_reader', 'api.catalogue_staff', 'SELECT'), 'askbert_reader cannot read api.catalogue_staff');
select ok(not has_table_privilege('askbert_reader', 'askbert.catalogue', 'INSERT,UPDATE,DELETE,TRUNCATE'), 'askbert_reader cannot write the view');
select ok(not has_schema_privilege('askbert_reader', 'mirror', 'USAGE') and not has_schema_privilege('askbert_reader', 'api', 'USAGE'),
  'askbert_reader has no USAGE on mirror or api');

select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('api','mirror','askbert') and has_function_privilege('askbert_reader', p.oid, 'EXECUTE')),
  0,
  'askbert_reader can EXECUTE no function in api, mirror or askbert');

-- 4. role shape
select ok(
  (select not rolsuper and not rolinherit and not rolcreaterole and not rolcreatedb and not rolbypassrls
          and not rolreplication and rolconnlimit = 10 from pg_roles where rolname = 'askbert_reader'),
  'askbert_reader: no superuser/inherit/createrole/createdb/bypassrls/replication; connection limit 10');

select is(
  (select count(*)::int from pg_auth_members m join pg_roles r on r.oid = m.member where r.rolname = 'askbert_reader'),
  0,
  'askbert_reader is a member of no other role');

select is(
  (select array_agg(s order by s) from pg_db_role_setting d join pg_roles r on r.oid = d.setrole,
          unnest(d.setconfig) s
    where r.rolname = 'askbert_reader' and d.setdatabase = 0),
  array['default_transaction_read_only=on','idle_in_transaction_session_timeout=5s','search_path=askbert','statement_timeout=2s']::text[],
  'askbert_reader runs read-only with a 2s statement timeout');

-- 5. every product is covered; archived ones are flagged, not hidden
select is((select count(*) from askbert.catalogue), (select count(*) from mirror.catalogue),
  'askbert.catalogue covers every product');

select ok(
  (select bool_and(archived = not m.active) from askbert.catalogue a join mirror.catalogue m using (sku)),
  'archived flags inactive products');

select ok(
  (select bool_and(a.price_unit = mirror.price_unit(m.product_type, m.category)
                   and a.promo_active = p.promo_active)
     from askbert.catalogue a join mirror.catalogue m using (sku) join api.catalogue_staff p using (sku)),
  'price_unit and promo_active match the app''s own rules');

select * from finish();
rollback;
