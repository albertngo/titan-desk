-- 010: stop keeping full-size originals in Supabase Storage, and let the worker see how
-- much Storage it is using (Albert, 2026-10-31).
--
-- The project was restricted for exceed_storage_size_quota: originals were ~4.2 GB of the
-- Free plan's 1 GB, and nothing ever read them (the apps serve only the WebP variants).
-- Airtable keeps the source file; a re-encode downloads it again from there.

-- 1. Originals are no longer stored: their path columns become optional. The row keeps
--    source_hash / original_mime / original_bytes / original_width / original_height,
--    which describe the Airtable file and still drive dedupe.
alter table mirror.catalogue_images alter column original_path drop not null;
comment on column mirror.catalogue_images.original_path is
  'NULL since 2026-10-31: originals are no longer kept in Storage (migration 010). Historical rows may name a deleted object until --mode purge-originals clears them.';
comment on column mirror.catalogue_images.orphaned_at is
  'Set when the variants are purged. (Before migration 010 it also meant the original was retained.)';

-- 2. New sync modes.
alter table mirror.sync_runs drop constraint sync_runs_mode_check;
alter table mirror.sync_runs add constraint sync_runs_mode_check
  check (mode in ('incremental', 'full', 'images', 'purge', 'report', 'purge_originals'));

-- 3. Storage usage per bucket, for the worker's size alert. storage.objects is not
--    readable by sync_worker; this definer function exposes totals only (no names, no
--    metadata), and only to the worker.
create function mirror.storage_usage()
returns table (bucket_id text, objects bigint, bytes bigint)
language sql stable security definer
set search_path = ''
as $fn$
  select o.bucket_id, count(*)::bigint, coalesce(sum((o.metadata ->> 'size')::bigint), 0)::bigint
    from storage.objects o
   group by o.bucket_id
$fn$;
revoke all on function mirror.storage_usage() from public, anon, authenticated;
grant execute on function mirror.storage_usage() to sync_worker;
