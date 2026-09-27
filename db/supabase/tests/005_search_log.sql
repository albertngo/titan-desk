-- 005: search_log is insert-only, own-uid only, and has no FK that could block offboarding.
begin;
select plan(7);

select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","email":"a@example.com","role":"authenticated"}', true);
set local role authenticated;

select lives_ok($$insert into api.search_log (query, filters, result_count, took_ms) values ('macaroon', '{"supplier":["VIDAR"]}', 3, 87)$$,
  'authenticated can insert with defaults (uid + email from the JWT)');
select throws_ok($$insert into api.search_log (user_id, query) values ('22222222-2222-2222-2222-222222222222', 'spoof')$$, '42501', null,
  'inserting another user_id is rejected by the policy');
select throws_ok($$select * from api.search_log$$, '42501', null, 'authenticated cannot read the log');
select throws_ok($$insert into api.search_log (query) values ('x') returning id$$, '42501', null,
  'RETURNING needs SELECT: never chain .select() on the insert');

reset role;
select is((select user_email from api.search_log where query = 'macaroon'), 'a@example.com', 'user_email defaulted from the JWT');
select is((select user_id from api.search_log where query = 'macaroon'), '11111111-1111-1111-1111-111111111111'::uuid, 'user_id defaulted from auth.uid()');

set local role anon;
select throws_ok($$insert into api.search_log (query) values ('anon')$$, '42501', null, 'anon cannot insert');
reset role;

select * from finish();
rollback;
