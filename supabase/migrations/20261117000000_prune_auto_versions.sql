-- Keep the online version history from growing forever, and index the map lists.
--
-- While someone edits, the app saves an automatic version of the whole map
-- every 10 minutes. Online, those were never removed, so a busy map gained
-- megabytes of old copies a day. Browser-only mode already keeps only the
-- newest 50 automatic versions; this does the same in the database.
-- Versions someone saved by hand, and the ones made on publish, restore or a
-- conflict, are never removed here.

create or replace function public.prune_auto_versions() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.map_versions v
  where v.map_id = new.map_id
    and v.reason = 'auto'
    and v.id in (
      select x.id from public.map_versions x
      where x.map_id = new.map_id and x.reason = 'auto'
      order by x.created_at desc, x.id desc
      offset 50
    );
  return null;
end;
$$;
revoke all on function public.prune_auto_versions() from public, anon, authenticated;

drop trigger if exists map_versions_prune_auto on public.map_versions;
create trigger map_versions_prune_auto
  after insert on public.map_versions
  for each row when (new.reason = 'auto')
  execute function public.prune_auto_versions();

-- One-time cleanup of what already piled up: keep each map's newest 50 automatic versions.
delete from public.map_versions v
using (
  select id, row_number() over (partition by map_id order by created_at desc, id desc) as n
  from public.map_versions
  where reason = 'auto'
) ranked
where v.id = ranked.id and ranked.n > 50;

-- The maps pages list a company's maps (and published maps) by company.
create index if not exists maps_company_id on public.maps (company_id);
create index if not exists published_maps_company_id on public.published_maps (company_id);
