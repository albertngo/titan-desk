-- 010: askBert's catalogue search. Two SECURITY INVOKER functions over api.catalogue_staff,
-- callable by signed-in staff (authenticated) and never by anon. Behaviour is pinned on the seed.
begin;
select plan(14);

select ok(
  (select bool_and(not prosecdef and provolatile = 's' and not proisstrict and proconfig is null)
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'api' and proname in ('askbert_search', 'askbert_relax')),
  'askbert_search/relax: SECURITY INVOKER, STABLE, not STRICT, no SET (inlinable)');

select ok(has_function_privilege('authenticated', 'api.askbert_search(text,text,text,text[],text,text[],numeric,numeric,text,boolean,boolean,boolean,boolean,text,text,text,int,int,numeric,numeric,numeric,text,text,boolean,text,int)', 'EXECUTE'),
  'staff can call askbert_search');
select ok(not has_function_privilege('anon', 'api.askbert_search(text,text,text,text[],text,text[],numeric,numeric,text,boolean,boolean,boolean,boolean,text,text,text,int,int,numeric,numeric,numeric,text,text,boolean,text,int)', 'EXECUTE'),
  'anon cannot call askbert_search');
select ok(not has_function_privilege('anon', 'api.askbert_relax(text,text,text,text[],text,text[],numeric,numeric,text,boolean,boolean,boolean,boolean,text,text,text,int,int,numeric,numeric,numeric,text,text,boolean,text,int)', 'EXECUTE'),
  'anon cannot call askbert_relax');

set local role authenticated;

select is(
  (select array_agg(s.sku order by s.ordinality) from api.askbert_search(p_kw => 'macaroon') with ordinality s),
  array['ENG-VIDR-0100C','ENG-VIDR-0100S','ENG-VIDR-0100R','ENG-VIDR-0182'],
  'keyword search: current first, then discontinued, then archived');

select is(
  (select array_agg(sku order by sku) from api.askbert_search(p_req_wp => true, p_pmax => 5)),
  array['GRNDSPC-0001','LAM-FAWK-0042','LVP-BIYK-BYKHYDRO7WI','LVP-WODN-0033'],
  'confirmed-waterproof at or under $5/sf');

select is((select cost from api.askbert_search(p_sku => 'eng-vidr-0100c')), 4.79::float8,
  'staff see cost (exact SKU lookup is case-insensitive)');

select ok((select archived from api.askbert_search(p_sku => 'ENG-VIDR-0182')), 'archived products are returned and flagged');

select is((select count(*)::int from api.askbert_search(p_kw => 'macaroon', p_availability => 'current_only')), 2,
  'current_only drops archived and discontinued');

select is((select count(*)::int from api.askbert_search(p_lim => 500)), 10, 'the row limit is capped at 10');

select is((select count(*)::int from api.askbert_search(p_kw => $$');drop table mirror.catalogue;--$$)), 0,
  'hostile keyword text is only ever a value');

select is((select total_matches from api.askbert_search(p_kw => 'macaroon') limit 1), 4::bigint, 'total_matches counts every match');

select is(api.askbert_relax(p_kw => 'macaroon', p_pmax => 4, p_req_wp => true) -> 'keyword', '4'::jsonb,
  'relax: dropping the keyword would let 4 through');
select is(api.askbert_relax(p_kw => 'macaroon', p_pmax => 4, p_req_wp => true) -> 'price', '0'::jsonb,
  'relax: dropping the price alone would not');

reset role;
select * from finish();
rollback;
