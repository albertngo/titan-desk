-- 012: the worker's Storage size alert (migration 010). Totals only, worker only.
begin;
select plan(5);

select ok(has_function_privilege('sync_worker', 'mirror.storage_usage()', 'execute'), 'sync_worker can read Storage totals');
select ok(not has_function_privilege('anon', 'mirror.storage_usage()', 'execute'), 'anon cannot');
select ok(not has_function_privilege('authenticated', 'mirror.storage_usage()', 'execute'), 'authenticated cannot');
select is(
  (select array_agg(p.parameter_name::text order by p.ordinal_position)
     from information_schema.routines r
     join information_schema.parameters p on p.specific_name = r.specific_name and p.parameter_mode = 'OUT'
    where r.routine_schema = 'mirror' and r.routine_name = 'storage_usage'),
  array['bucket_id', 'objects', 'bytes'],
  'returns bucket totals only: no object names or metadata');
select ok(
  (select is_nullable = 'YES' from information_schema.columns
    where table_schema = 'mirror' and table_name = 'catalogue_images' and column_name = 'original_path'),
  'original_path is optional: originals are no longer stored');

select * from finish();
rollback;
