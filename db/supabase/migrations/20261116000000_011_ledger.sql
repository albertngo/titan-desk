-- 011: the Titan Ledger, phase 1 (Albert, 2026-11-13; vault 05_decisions/2026-11-13-titan-ledger.md).
--
-- One shared, append-only record of what every agent and app decided or did, per entity.
-- Vault = the rules (why). Ledger = case-by-case history (what already happened here).
-- Phase 1: write path, backfill, read CLI. Nothing may make a decision from the ledger yet.
--
-- Two schemas:
--   ledger      the table and the current_state view. NOT exposed to the Data API.
--   ledger_api  four functions only (append_event, append_events, recent, state), SECURITY INVOKER.
--               Exposed to PostgREST so cloud sessions, which can reach Supabase over HTTPS
--               only (raw Postgres 5432/6543 is refused there), can write with a JWT whose
--               role is ledger_writer. No anon or authenticated grant anywhere.

create schema if not exists ledger;
create schema if not exists ledger_api;

revoke all on schema ledger from public;
revoke all on schema ledger_api from public;

-- ---------------------------------------------------------------------------------------
-- 1. The table
-- ---------------------------------------------------------------------------------------
create table ledger.events (
  id               uuid primary key default gen_random_uuid(),
  occurred_at      timestamptz not null,
  recorded_at      timestamptz not null default now(),
  actor            text not null check (actor ~ '^(person:)?[a-z0-9][a-z0-9_.:-]{0,63}$'),
  actor_kind       text not null check (actor_kind in ('agent', 'app', 'person', 'make')),
  entity_type      text not null check (entity_type in (
                     'customer', 'opportunity', 'quote', 'project', 'work_order', 'contractor',
                     'supplier', 'price_list', 'sku', 'post', 'conversation',
                     -- 2026-11-24 memory-architecture doc: the overseer's wider entity set.
                     -- A "product" is a `sku` (the catalogue SKU), never a second type.
                     'campaign', 'bank_transaction', 'purchase_order', 'return', 'period_close')),
  entity_source    text not null check (entity_source in (
                     'ghl', 'airtable', 'notion', 'lightspeed', 'metricool', 'qbo', 'meta', 'whatsapp')),
  entity_id        text not null check (length(entity_id) between 1 and 128),
  event_type       text not null check (event_type ~ '^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$'),
  result           text not null check (result in ('planned', 'executed', 'refused', 'failed')),
  reason           text check (length(reason) <= 280),
  rule_ref         text check (length(rule_ref) <= 200),
  state_key        text check (state_key ~ '^[a-z][a-z0-9_]*$'),
  state_value      text check (length(state_value) <= 200),
  valid_until      timestamptz,
  approved_by      text check (length(approved_by) <= 120),
  run_ref          text check (length(run_ref) <= 200),
  sensitivity      text not null default 'private' check (sensitivity in ('team', 'private')),
  payload          jsonb not null default '{}'::jsonb
                     check (jsonb_typeof(payload) = 'object' and pg_column_size(payload) <= 2048),
  idempotency_key  text not null unique check (length(idempotency_key) between 8 and 200),
  -- Outcomes (2026-11-24, "do first"): whether an earlier decision worked. An outcome is its
  -- own row, never an edit: outcome_of points at the decision, outcome says how it went.
  outcome_of       uuid references ledger.events (id),
  outcome          text check (outcome in ('worked', 'did_not_work', 'mixed', 'unknown')),
  check ((outcome_of is null) = (outcome is null)),
  check (state_value is null or state_key is not null),
  check (valid_until is null or state_key is not null)
);

comment on table ledger.events is
  'Append-only. One row per thing an agent/app/person decided or did to one entity. '
  'reason is our words, never customer text; payload is ids and numbers only.';

create index events_entity_idx on ledger.events (entity_source, entity_id, occurred_at desc);
create index events_type_idx   on ledger.events (event_type, occurred_at desc);
create index events_outcome_idx on ledger.events (outcome_of) where outcome_of is not null;
create index events_state_idx  on ledger.events (entity_source, entity_type, entity_id, state_key, occurred_at desc)
  where state_key is not null;

-- Append-only: no UPDATE, DELETE or TRUNCATE, for any role (the owner included).
create function ledger.refuse_change() returns trigger
language plpgsql as $$
begin
  raise exception 'ledger.events is append-only (% refused)', tg_op
    using errcode = 'insufficient_privilege';
end $$;
revoke execute on function ledger.refuse_change() from public;

create trigger events_no_update_delete
  before update or delete on ledger.events
  for each row execute function ledger.refuse_change();
create trigger events_no_truncate
  before truncate on ledger.events
  for each statement execute function ledger.refuse_change();

-- ---------------------------------------------------------------------------------------
-- 2. current_state: the latest row per (entity, state_key). A later row whose state_value
--    is null clears the state; an expired valid_until drops it.
-- ---------------------------------------------------------------------------------------
create view ledger.current_state as
select entity_source, entity_type, entity_id, state_key, state_value, valid_until,
       occurred_at, event_type, actor, result, rule_ref, sensitivity, id as event_id
  from (
    select distinct on (entity_source, entity_type, entity_id, state_key) *
      from ledger.events
     where state_key is not null
       and result = 'executed'
     order by entity_source, entity_type, entity_id, state_key, occurred_at desc, recorded_at desc
  ) latest
 where state_value is not null
   and (valid_until is null or valid_until > now());

-- ---------------------------------------------------------------------------------------
-- 3. The API functions (PostgREST: POST /rest/v1/rpc/<name>, Content-Profile: ledger_api)
-- ---------------------------------------------------------------------------------------
-- append_event: insert one event; a repeated idempotency_key is a no-op that reports the
-- existing row. Returns {"status": "inserted"|"duplicate", "id": uuid}.
create function ledger_api.append_event(e jsonb) returns jsonb
language plpgsql security invoker as $$
declare
  new_id uuid;
begin
  insert into ledger.events (
    occurred_at, actor, actor_kind, entity_type, entity_source, entity_id, event_type,
    result, reason, rule_ref, state_key, state_value, valid_until, approved_by, run_ref,
    sensitivity, payload, idempotency_key, outcome_of, outcome)
  values (
    (e->>'occurred_at')::timestamptz, e->>'actor', e->>'actor_kind', e->>'entity_type',
    e->>'entity_source', e->>'entity_id', e->>'event_type', e->>'result', e->>'reason',
    e->>'rule_ref', e->>'state_key', e->>'state_value', (e->>'valid_until')::timestamptz,
    e->>'approved_by', e->>'run_ref', coalesce(e->>'sensitivity', 'private'),
    coalesce(e->'payload', '{}'::jsonb), e->>'idempotency_key',
    (e->>'outcome_of')::uuid, e->>'outcome')
  on conflict (idempotency_key) do nothing
  returning id into new_id;

  if new_id is not null then
    return jsonb_build_object('status', 'inserted', 'id', new_id);
  end if;
  return jsonb_build_object('status', 'duplicate', 'id',
    (select id from ledger.events where idempotency_key = e->>'idempotency_key'));
end $$;

-- append_events: a JSON array of events, at most 500, one statement. For the backfill and for
-- a run's batch. Returns {"inserted": n, "duplicate": m}.
create function ledger_api.append_events(es jsonb) returns jsonb
language plpgsql security invoker as $$
declare
  n_in int;
  n_all int;
begin
  if jsonb_typeof(es) <> 'array' then
    raise exception 'append_events takes a JSON array' using errcode = 'invalid_parameter_value';
  end if;
  n_all := jsonb_array_length(es);
  if n_all > 500 then
    raise exception 'append_events takes at most 500 events (got %)', n_all using errcode = 'invalid_parameter_value';
  end if;
  insert into ledger.events (
    occurred_at, actor, actor_kind, entity_type, entity_source, entity_id, event_type,
    result, reason, rule_ref, state_key, state_value, valid_until, approved_by, run_ref,
    sensitivity, payload, idempotency_key, outcome_of, outcome)
  select (e->>'occurred_at')::timestamptz, e->>'actor', e->>'actor_kind', e->>'entity_type',
         e->>'entity_source', e->>'entity_id', e->>'event_type', e->>'result', e->>'reason',
         e->>'rule_ref', e->>'state_key', e->>'state_value', (e->>'valid_until')::timestamptz,
         e->>'approved_by', e->>'run_ref', coalesce(e->>'sensitivity', 'private'),
         coalesce(e->'payload', '{}'::jsonb), e->>'idempotency_key',
         (e->>'outcome_of')::uuid, e->>'outcome'
    from jsonb_array_elements(es) e
  on conflict (idempotency_key) do nothing;
  get diagnostics n_in = row_count;
  return jsonb_build_object('inserted', n_in, 'duplicate', n_all - n_in);
end $$;

create function ledger_api.recent(
  p_source text, p_id text, p_type text default null,
  p_limit int default 10, p_since timestamptz default null)
returns setof ledger.events
language sql stable security invoker as $$
  select * from ledger.events
   where entity_source = p_source and entity_id = p_id
     and (p_type is null or entity_type = p_type)
     and (p_since is null or occurred_at >= p_since)
   order by occurred_at desc, recorded_at desc
   limit least(greatest(coalesce(p_limit, 10), 1), 200);
$$;

create function ledger_api.state(p_source text, p_id text, p_type text default null)
returns setof ledger.current_state
language sql stable security invoker as $$
  select * from ledger.current_state
   where entity_source = p_source and entity_id = p_id
     and (p_type is null or entity_type = p_type)
   order by state_key;
$$;

-- Postgres grants EXECUTE to PUBLIC on every new function: revoke it explicitly (README §Schemas).
revoke execute on function ledger_api.append_event(jsonb) from public, anon, authenticated;
revoke execute on function ledger_api.append_events(jsonb) from public, anon, authenticated;
revoke execute on function ledger_api.recent(text, text, text, int, timestamptz) from public, anon, authenticated;
revoke execute on function ledger_api.state(text, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------
-- 4. ledger_writer: INSERT + SELECT on events, SELECT on current_state, EXECUTE on the
--    four functions. Nothing else. NOLOGIN; Albert sets a password by hand for direct
--    (Mac) use, and PostgREST reaches it through authenticator with a role=ledger_writer JWT.
-- ---------------------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'ledger_writer') then
    create role ledger_writer nologin noinherit;
  end if;
end $$;
grant ledger_writer to authenticator;
alter role ledger_writer set statement_timeout = '5s';

grant usage on schema ledger, ledger_api to ledger_writer;
grant select, insert on ledger.events to ledger_writer;
grant select on ledger.current_state to ledger_writer;
grant execute on function ledger_api.append_event(jsonb) to ledger_writer;
grant execute on function ledger_api.append_events(jsonb) to ledger_writer;
grant execute on function ledger_api.recent(text, text, text, int, timestamptz) to ledger_writer;
grant execute on function ledger_api.state(text, text, text) to ledger_writer;

-- Belt and braces: the API roles get nothing here, even if a default privilege says otherwise.
revoke all on all tables in schema ledger from anon, authenticated;
