-- 001: the tier boundary as privileges. Every object in api/mirror is enumerated.
begin;
select plan(34);

-- schema usage
select ok(has_schema_privilege('anon', 'api', 'USAGE'),            'anon has USAGE on api');
select ok(has_schema_privilege('authenticated', 'api', 'USAGE'),   'authenticated has USAGE on api');
-- USAGE on mirror is name resolution only (the views' helper functions run as the caller); tables stay denied below
select ok(has_schema_privilege('anon', 'mirror', 'USAGE'),         'anon has USAGE on mirror (helper functions only)');
select ok(has_schema_privilege('authenticated', 'mirror', 'USAGE'), 'authenticated has USAGE on mirror (helper functions only)');
select ok(has_schema_privilege('sync_worker', 'mirror', 'USAGE'),  'sync_worker has USAGE on mirror');
select ok(not has_schema_privilege('sync_worker', 'api', 'USAGE'), 'sync_worker has no USAGE on api');

-- views
select ok(has_table_privilege('anon', 'api.catalogue_public', 'SELECT'),               'anon can SELECT catalogue_public');
select ok(not has_table_privilege('anon', 'api.catalogue_staff', 'SELECT'),            'anon cannot SELECT catalogue_staff');
select ok(not has_table_privilege('anon', 'api.catalogue_facets', 'SELECT'),           'anon cannot SELECT catalogue_facets');
select ok(not has_table_privilege('anon', 'api.sync_status', 'SELECT'),                'anon cannot SELECT sync_status');
select ok(has_table_privilege('authenticated', 'api.catalogue_staff', 'SELECT'),       'authenticated can SELECT catalogue_staff');
select ok(has_table_privilege('authenticated', 'api.catalogue_facets', 'SELECT'),      'authenticated can SELECT catalogue_facets');
select ok(has_table_privilege('authenticated', 'api.sync_status', 'SELECT'),           'authenticated can SELECT sync_status');

-- no API role touches the base tables, even by direct name
select ok(not has_table_privilege('anon', 'mirror.catalogue', 'SELECT'),               'anon cannot SELECT mirror.catalogue');
select ok(not has_table_privilege('authenticated', 'mirror.catalogue', 'SELECT'),      'authenticated cannot SELECT mirror.catalogue');
select ok(not has_table_privilege('authenticated', 'mirror.catalogue_images', 'SELECT'), 'authenticated cannot SELECT mirror.catalogue_images');
select ok(has_table_privilege('sync_worker', 'mirror.catalogue', 'INSERT'),            'sync_worker can INSERT mirror.catalogue');
select ok(has_table_privilege('sync_worker', 'mirror.catalogue_stage', 'TRUNCATE'),    'sync_worker can TRUNCATE the stage table');
select ok(not has_table_privilege('sync_worker', 'api.search_log', 'SELECT'),          'sync_worker cannot read search_log');

-- search_log: insert-only for staff
select ok(has_table_privilege('authenticated', 'api.search_log', 'INSERT'),            'authenticated can INSERT search_log');
select ok(not has_table_privilege('authenticated', 'api.search_log', 'SELECT'),        'authenticated cannot SELECT search_log');
select ok(not has_table_privilege('anon', 'api.search_log', 'INSERT'),                 'anon cannot INSERT search_log');

-- functions: the full EXECUTE matrix for anon over every function in api
select is(
  (select array_agg(p.proname::text order by p.proname)
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'api' and has_function_privilege('anon', p.oid, 'EXECUTE')),
  array['parse_query', 'search_public', 'today'],
  'anon can EXECUTE exactly parse_query, search_public, today in api');
select is(
  (select array_agg(p.proname::text order by p.proname)
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'api' and has_function_privilege('authenticated', p.oid, 'EXECUTE')),
  array['askbert_relax', 'askbert_search', 'parse_query', 'search_public', 'search_staff', 'search_staff_grouped', 'today'],
  'authenticated can EXECUTE exactly askbert_relax, askbert_search, parse_query, search_public, search_staff, search_staff_grouped, today in api');
select ok(not has_function_privilege('anon', 'mirror.hook_restrict_signup(jsonb)', 'EXECUTE'), 'anon cannot EXECUTE the auth hook');
select ok(has_function_privilege('supabase_auth_admin', 'mirror.hook_restrict_signup(jsonb)', 'EXECUTE'), 'supabase_auth_admin can EXECUTE the auth hook');

-- views are owned by postgres (owner-privilege semantics)
select is((select viewowner::text from pg_views where schemaname = 'api' and viewname = 'catalogue_public'), 'postgres', 'catalogue_public owned by postgres');
select is((select viewowner::text from pg_views where schemaname = 'api' and viewname = 'catalogue_staff'),  'postgres', 'catalogue_staff owned by postgres');

-- api.today() is STABLE (a VOLATILE function in a view target list blocks flattening)
select is((select provolatile::text from pg_proc where oid = 'api.today()'::regprocedure), 's', 'api.today() is STABLE');

-- behaviour under the role, not just the catalog
set local role anon;
select lives_ok($$select * from api.catalogue_public limit 5$$, 'anon: every column of catalogue_public is readable (helper functions resolve)');
select throws_ok($$select cost from api.catalogue_public$$, '42703', null, 'anon: cost is not a column of catalogue_public');
select throws_ok($$select * from api.catalogue_staff$$, '42501', null, 'anon: catalogue_staff is permission denied');
select throws_ok($$select * from mirror.catalogue$$, '42501', null, 'anon: mirror.catalogue is permission denied');
reset role;
set local role authenticated;
select lives_ok($$select * from api.catalogue_staff limit 5$$, 'authenticated: every column of catalogue_staff is readable');
reset role;

select * from finish();
rollback;
