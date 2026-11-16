-- 013: the Titan Ledger (migration 011). Grants, append-only, current_state, idempotency.
begin;
select plan(24);

-- Grants: ledger_writer gets exactly INSERT+SELECT on events and SELECT on current_state.
select ok(has_table_privilege('ledger_writer', 'ledger.events', 'insert'), 'writer can insert events');
select ok(has_table_privilege('ledger_writer', 'ledger.events', 'select'), 'writer can select events');
select ok(not has_table_privilege('ledger_writer', 'ledger.events', 'update'), 'writer cannot update');
select ok(not has_table_privilege('ledger_writer', 'ledger.events', 'delete'), 'writer cannot delete');
select ok(not has_table_privilege('ledger_writer', 'ledger.events', 'truncate'), 'writer cannot truncate');
select ok(has_table_privilege('ledger_writer', 'ledger.current_state', 'select'), 'writer can read current_state');
select ok(not has_schema_privilege('ledger_writer', 'mirror', 'usage'), 'writer has no mirror access');
select ok(not has_schema_privilege('ledger_writer', 'api', 'usage'), 'writer has no api access');
select ok(not has_schema_privilege('anon', 'ledger', 'usage') and not has_schema_privilege('authenticated', 'ledger', 'usage'),
  'anon/authenticated have no ledger schema');
select ok(not has_schema_privilege('anon', 'ledger_api', 'usage') and not has_schema_privilege('authenticated', 'ledger_api', 'usage'),
  'anon/authenticated have no ledger_api schema');
select is(
  (select count(*)::int from information_schema.routine_privileges
    where routine_schema = 'ledger_api' and grantee in ('PUBLIC', 'anon', 'authenticated')),
  0, 'no ledger_api function is executable by PUBLIC/anon/authenticated');
select is(
  (select array_agg(routine_name::text order by routine_name) from information_schema.routine_privileges
    where routine_schema = 'ledger_api' and grantee = 'ledger_writer'),
  array['append_event', 'recent', 'state'], 'writer executes exactly the three API functions');
select ok(not (select rolcanlogin from pg_roles where rolname = 'ledger_writer'),
  'ledger_writer created NOLOGIN (password set by hand)');

-- Write path as the writer role.
set local role ledger_writer;

select is(
  ledger_api.append_event('{"occurred_at":"2026-11-01T10:00:00-04:00","actor":"ghl-triage","actor_kind":"agent",
    "entity_type":"conversation","entity_source":"ghl","entity_id":"conv_1","event_type":"triage.mark_read",
    "result":"executed","sensitivity":"team","idempotency_key":"test-key-0001"}'::jsonb)->>'status',
  'inserted', 'append_event inserts');
select is(
  ledger_api.append_event('{"occurred_at":"2026-11-01T10:00:00-04:00","actor":"ghl-triage","actor_kind":"agent",
    "entity_type":"conversation","entity_source":"ghl","entity_id":"conv_1","event_type":"triage.mark_read",
    "result":"executed","sensitivity":"team","idempotency_key":"test-key-0001"}'::jsonb)->>'status',
  'duplicate', 'same idempotency_key is a no-op');
select is((select count(*)::int from ledger.events where idempotency_key = 'test-key-0001'), 1, 'still one row');
select throws_ok($$insert into ledger.events (occurred_at, actor, actor_kind, entity_type, entity_source, entity_id,
    event_type, result, idempotency_key) values (now(), 'x', 'agent', 'sku', 'airtable', 'r1', 'a.b', 'executed', 'test-key-0001')$$,
  '23505', null, 'a raw duplicate insert conflicts');

-- Append-only.
select throws_ok($$update ledger.events set reason = 'x' where idempotency_key = 'test-key-0001'$$,
  '42501', null, 'writer UPDATE refused');
reset role;
select throws_ok($$update ledger.events set reason = 'x' where idempotency_key = 'test-key-0001'$$,
  '42501', null, 'owner UPDATE blocked by trigger');
select throws_ok($$delete from ledger.events where idempotency_key = 'test-key-0001'$$,
  '42501', null, 'owner DELETE blocked by trigger');

-- current_state: latest executed row wins, null clears, expiry drops.
set local role ledger_writer;
select ledger_api.append_event(('{"occurred_at":"2026-11-01T09:00:00Z","actor":"catalog-sync","actor_kind":"agent",
  "entity_type":"sku","entity_source":"airtable","entity_id":"recA","event_type":"catalog.hold_sku","result":"executed",
  "state_key":"hold","state_value":"troubled","idempotency_key":"test-key-0002"}')::jsonb);
select ledger_api.append_event(('{"occurred_at":"2026-11-02T09:00:00Z","actor":"catalog-sync","actor_kind":"agent",
  "entity_type":"sku","entity_source":"airtable","entity_id":"recA","event_type":"catalog.hold_sku","result":"planned",
  "state_key":"hold","state_value":"planned-only","idempotency_key":"test-key-0003"}')::jsonb);
select ledger_api.append_event(('{"occurred_at":"2026-11-01T09:00:00Z","actor":"ghl-triage","actor_kind":"agent",
  "entity_type":"conversation","entity_source":"ghl","entity_id":"conv_2","event_type":"followup.snooze","result":"executed",
  "state_key":"snoozed","state_value":"yes","valid_until":"2026-01-01T00:00:00Z","idempotency_key":"test-key-0004"}')::jsonb);
select is((select state_value from ledger_api.state('airtable', 'recA')), 'troubled',
  'current_state ignores planned rows and keeps the executed hold');
select ledger_api.append_event(('{"occurred_at":"2026-11-03T09:00:00Z","actor":"catalog-sync","actor_kind":"agent",
  "entity_type":"sku","entity_source":"airtable","entity_id":"recA","event_type":"catalog.release_sku","result":"executed",
  "state_key":"hold","idempotency_key":"test-key-0005"}')::jsonb);
select is((select count(*)::int from ledger_api.state('airtable', 'recA')), 0, 'a later null state_value clears it');
select is((select count(*)::int from ledger_api.state('ghl', 'conv_2')), 0, 'an expired valid_until drops it');
select is((select count(*)::int from ledger_api.recent('airtable', 'recA', null, 10, null)), 3, 'recent returns entity history');
reset role;

select * from finish();
rollback;
