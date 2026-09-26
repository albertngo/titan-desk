-- Minimal stand-in for what a Supabase project provides out of the box, so the real
-- migration can run unchanged on a plain Postgres 16. Never applied to Supabase itself.

-- Roles Supabase ships with.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin noinherit bypassrls; end if;
  if not exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then create role supabase_auth_admin nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'supabase_storage_admin') then create role supabase_storage_admin nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then create role authenticator noinherit login; end if;
end $$;
grant anon, authenticated, service_role to authenticator;

-- Supabase hardens `public` for new projects: no automatic grants to API roles.
revoke create on schema public from public;
alter default privileges for role postgres in schema public revoke select, insert, update, delete on tables from anon, authenticated, service_role;
alter default privileges for role postgres in schema public revoke execute on functions from anon, authenticated, service_role;

-- `extensions` schema (Supabase installs extensions here).
create schema if not exists extensions;
grant usage on schema extensions to anon, authenticated, service_role;

-- `auth` schema: just enough of auth.users + the helper functions the views/policies use.
create schema if not exists auth;
alter schema auth owner to supabase_auth_admin;
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb default '{}'::jsonb,
  raw_app_meta_data jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);
alter table auth.users owner to supabase_auth_admin;
grant usage on schema auth to anon, authenticated, service_role, postgres;

create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(coalesce(
    current_setting('request.jwt.claim.sub', true),
    current_setting('request.jwt.claims', true)::jsonb ->> 'sub'
  ), '')::uuid
$$;
create or replace function auth.jwt() returns jsonb
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')
  )::jsonb
$$;
create or replace function auth.role() returns text
language sql stable as $$
  select coalesce(
    current_setting('request.jwt.claim.role', true),
    current_setting('request.jwt.claims', true)::jsonb ->> 'role'
  )
$$;
grant execute on function auth.uid(), auth.jwt(), auth.role() to anon, authenticated, service_role, postgres;

-- `storage` schema: the buckets table the migration inserts into.
create schema if not exists storage;
alter schema storage owner to supabase_storage_admin;
create table if not exists storage.buckets (
  id text primary key,
  name text not null unique,
  owner uuid,
  public boolean default false,
  avif_autodetection boolean default false,
  file_size_limit bigint,
  allowed_mime_types text[],
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table storage.buckets owner to supabase_storage_admin;
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text,
  owner uuid,
  metadata jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  last_accessed_at timestamptz default now()
);
alter table storage.objects owner to supabase_storage_admin;
grant usage on schema storage to anon, authenticated, service_role, postgres;
grant all on storage.buckets, storage.objects to postgres, service_role;

-- On Supabase the `postgres` role is not a superuser but has BYPASSRLS and owns the
-- migrated objects. Locally it is a superuser; SET ROLE in tests still applies the
-- target role's privileges, which is what the grant tests rely on.
