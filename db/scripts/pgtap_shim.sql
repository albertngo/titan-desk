-- The subset of pgTAP the tests in db/supabase/tests use, implemented in plpgsql so the
-- same test files run on a plain Postgres without the pgtap extension. On Supabase
-- (`supabase test db`) the real pgTAP is used and this file is never loaded.
--
-- Output follows TAP: `1..N`, `ok N - desc`, `not ok N - desc`, `# diag`.

create schema if not exists tap;
grant usage on schema tap to public;

create table if not exists tap.__state (k text primary key, v text);
grant select, insert, update, delete on tap.__state to public;

create or replace function tap.__next() returns int language plpgsql as $$
declare n int;
begin
  insert into tap.__state(k, v) values ('n', '0') on conflict do nothing;
  update tap.__state set v = (v::int + 1)::text where k = 'n' returning v::int into n;
  return n;
end $$;

create or replace function tap.__fail() returns void language plpgsql as $$
begin
  insert into tap.__state(k, v) values ('failed', '1') on conflict (k) do update set v = '1';
end $$;

create or replace function public.plan(n int) returns text language plpgsql as $$
begin
  delete from tap.__state;
  return '1..' || n;
end $$;

create or replace function public.no_plan() returns setof boolean language plpgsql as $$
begin delete from tap.__state; return; end $$;

create or replace function public.finish() returns setof text language plpgsql as $$
declare n int; f text;
begin
  select v::int into n from tap.__state where k = 'n';
  select v into f from tap.__state where k = 'failed';
  if f is not null then return next '# Looks like you failed some tests'; end if;
  return next '# ran ' || coalesce(n, 0) || ' tests';
end $$;

create or replace function public.diag(msg text) returns text language sql as $$
  select '# ' || replace(msg, E'\n', E'\n# ')
$$;

create or replace function public.ok(cond boolean, descr text default '') returns text language plpgsql as $$
declare n int := tap.__next();
begin
  if coalesce(cond, false) then
    return 'ok ' || n || ' - ' || descr;
  else
    perform tap.__fail();
    return 'not ok ' || n || ' - ' || descr;
  end if;
end $$;

create or replace function public.is(got anyelement, want anyelement, descr text default '') returns text language plpgsql as $$
declare n int := tap.__next();
begin
  if got is not distinct from want then
    return 'ok ' || n || ' - ' || descr;
  else
    perform tap.__fail();
    return 'not ok ' || n || ' - ' || descr || E'\n#   have: ' || coalesce(got::text, 'NULL') || E'\n#   want: ' || coalesce(want::text, 'NULL');
  end if;
end $$;

create or replace function public.isnt(got anyelement, want anyelement, descr text default '') returns text language plpgsql as $$
declare n int := tap.__next();
begin
  if got is distinct from want then
    return 'ok ' || n || ' - ' || descr;
  else
    perform tap.__fail();
    return 'not ok ' || n || ' - ' || descr || E'\n#   both: ' || coalesce(got::text, 'NULL');
  end if;
end $$;

-- throws_ok(sql, sqlstate[, description]) and throws_ok(sql, description)
create or replace function public.throws_ok(sql text, errcode text default null, descr text default null) returns text language plpgsql as $$
declare n int := tap.__next(); d text := coalesce(descr, 'threw ' || coalesce(errcode, 'an exception'));
begin
  begin
    execute sql;
  exception when others then
    if errcode is null or errcode = '' or sqlstate = errcode then
      return 'ok ' || n || ' - ' || d;
    else
      perform tap.__fail();
      return 'not ok ' || n || ' - ' || d || E'\n#   caught: ' || sqlstate || ' ' || sqlerrm || E'\n#   wanted: ' || errcode;
    end if;
  end;
  perform tap.__fail();
  return 'not ok ' || n || ' - ' || d || E'\n#   no exception thrown';
end $$;

-- throws_ok(sql, sqlstate, ermsg, description): pgTAP's full form. ermsg NULL = not compared (same as pgTAP).
create or replace function public.throws_ok(sql text, errcode text, ermsg text, descr text) returns text language plpgsql as $$
declare n int := tap.__next(); d text := coalesce(descr, 'threw ' || coalesce(errcode, 'an exception'));
begin
  begin
    execute sql;
  exception when others then
    if (errcode is null or errcode = '' or sqlstate = errcode) and (ermsg is null or sqlerrm = ermsg) then
      return 'ok ' || n || ' - ' || d;
    else
      perform tap.__fail();
      return 'not ok ' || n || ' - ' || d || E'\n#   caught: ' || sqlstate || ' ' || sqlerrm || E'\n#   wanted: ' || coalesce(errcode, '') || ' ' || coalesce(ermsg, '');
    end if;
  end;
  perform tap.__fail();
  return 'not ok ' || n || ' - ' || d || E'\n#   no exception thrown';
end $$;

create or replace function public.lives_ok(sql text, descr text default '') returns text language plpgsql as $$
declare n int := tap.__next();
begin
  begin
    execute sql;
  exception when others then
    perform tap.__fail();
    return 'not ok ' || n || ' - ' || descr || E'\n#   died: ' || sqlstate || ' ' || sqlerrm;
  end;
  return 'ok ' || n || ' - ' || descr;
end $$;

-- results_eq(sql_a, sql_b[, description]): compares full result sets as text arrays.
create or replace function public.results_eq(a text, b text, descr text default '') returns text language plpgsql as $$
declare n int := tap.__next(); ra text[]; rb text[];
begin
  execute 'select array_agg(t::text) from (' || a || ') t' into ra;
  execute 'select array_agg(t::text) from (' || b || ') t' into rb;
  if ra is not distinct from rb then
    return 'ok ' || n || ' - ' || descr;
  else
    perform tap.__fail();
    return 'not ok ' || n || ' - ' || descr || E'\n#   have: ' || coalesce(ra::text, 'NULL') || E'\n#   want: ' || coalesce(rb::text, 'NULL');
  end if;
end $$;

create or replace function public.has_column(sch name, tbl name, col name, descr text default '') returns text language plpgsql as $$
begin
  return ok(exists (select 1 from information_schema.columns where table_schema = sch and table_name = tbl and column_name = col),
            coalesce(nullif(descr, ''), sch || '.' || tbl || ' has column ' || col));
end $$;

create or replace function public.hasnt_column(sch name, tbl name, col name, descr text default '') returns text language plpgsql as $$
begin
  return ok(not exists (select 1 from information_schema.columns where table_schema = sch and table_name = tbl and column_name = col),
            coalesce(nullif(descr, ''), sch || '.' || tbl || ' lacks column ' || col));
end $$;

create or replace function public.has_view(sch name, v name, descr text default '') returns text language plpgsql as $$
begin
  return ok(exists (select 1 from pg_views where schemaname = sch and viewname = v),
            coalesce(nullif(descr, ''), sch || '.' || v || ' is a view'));
end $$;

create or replace function public.has_function(sch name, fn name, descr text default '') returns text language plpgsql as $$
begin
  return ok(exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = sch and p.proname = fn),
            coalesce(nullif(descr, ''), sch || '.' || fn || '() exists'));
end $$;

grant execute on all functions in schema public to public;
