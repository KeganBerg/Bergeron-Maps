-- Map slots and live-map limit per site.
--
-- Each site has 5 numbered map slots, like the save slots on a handheld game.
-- A map in the trash gives its slot back; restoring it takes a free slot again.
-- At most 2 maps per site can be live (published and not in the trash) at once.
-- Publishing a third, or moving or restoring a live map into a site that already
-- has 2, is refused with a plain message. unpublish_map() takes a map offline.
--
-- Sites that already hold more than 5 maps keep them: the extras have no slot
-- number and can still be edited, but no new map can be added there until the
-- site is back under 5.

alter table public.maps add column if not exists slot smallint check (slot between 1 and 5);

-- Backfill: oldest maps first. Done with the write trigger off so edit times and
-- authorship stay as they were.
alter table public.maps disable trigger maps_before_write;
update public.maps m set slot = r.n
from (
  select id, row_number() over (partition by facility_id order by created_at, id) as n
  from public.maps where deleted_at is null
) r
where m.id = r.id and r.n <= 5 and m.slot is null;
update public.maps set slot = null where deleted_at is not null and slot is not null;
alter table public.maps enable trigger maps_before_write;

create unique index if not exists maps_one_map_per_slot on public.maps (facility_id, slot)
  where deleted_at is null and slot is not null;

create or replace function public.site_live_map_count(p_facility uuid, p_except uuid)
returns integer
language sql stable security definer set search_path = public as $$
  select count(*)::integer
  from public.published_maps p join public.maps m on m.id = p.map_id
  where m.facility_id = p_facility and m.deleted_at is null and m.id is distinct from p_except
$$;
revoke execute on function public.site_live_map_count(uuid, uuid) from public, anon, authenticated;

-- Gives a map a slot when it is created, moved to another site or restored, and
-- checks the live-map limit when a live map arrives at a site. Clients cannot set
-- the slot on an existing map; on a new map they may ask for a free one.
create or replace function public.maps_assign_slot()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  site_name text;
  arriving boolean;
  wanted smallint;
begin
  if new.deleted_at is not null then
    new.slot := null;
    return new;
  end if;
  arriving := tg_op = 'INSERT' or new.facility_id is distinct from old.facility_id or old.deleted_at is not null;
  if not arriving then
    new.slot := old.slot;
    return new;
  end if;

  -- One change at a time per site, so two people can't both take the last slot.
  select name into site_name from public.facilities where id = new.facility_id for update;
  wanted := case when tg_op = 'INSERT' then new.slot end;
  if wanted is not null and exists (
    select 1 from public.maps where facility_id = new.facility_id and deleted_at is null and slot = wanted and id <> new.id
  ) then
    wanted := null;
  end if;
  if wanted is null then
    select s into wanted from generate_series(1, 5) s
    where not exists (select 1 from public.maps where facility_id = new.facility_id and deleted_at is null and slot = s and id <> new.id)
    order by s limit 1;
  end if;
  if wanted is null or (select count(*) from public.maps where facility_id = new.facility_id and deleted_at is null and id <> new.id) >= 5 then
    raise exception 'All 5 map slots at “%” are in use. Delete one of its maps to free a slot.', site_name using errcode = '54000';
  end if;
  new.slot := wanted;

  if tg_op = 'UPDATE' and exists (select 1 from public.published_maps where map_id = new.id)
     and public.site_live_map_count(new.facility_id, new.id) >= 2 then
    raise exception '“%” already has 2 live maps, the most a site can have. Take one offline first.', site_name using errcode = '54000';
  end if;
  return new;
end $$;
revoke execute on function public.maps_assign_slot() from public, anon, authenticated;

drop trigger if exists maps_assign_slot on public.maps;
create trigger maps_assign_slot before insert or update of facility_id, deleted_at, slot on public.maps
for each row execute function public.maps_assign_slot();

-- Publishing: same as before, plus the 2-live-maps limit for maps that aren't live yet.
create or replace function public.publish_map(p_map uuid)
returns timestamptz
language plpgsql security definer set search_path = public as $$
declare m public.maps; t timestamptz := now(); site_name text;
begin
  select * into m from public.maps where id = p_map;
  if m is null or not public.can_edit_facility(m.facility_id) then
    raise exception 'You don''t have permission to publish this map.' using errcode = '42501';
  end if;
  if m.deleted_at is not null then
    raise exception 'Restore this map from Recently deleted before publishing it.' using errcode = '22023';
  end if;
  select name into site_name from public.facilities where id = m.facility_id for update;
  if not exists (select 1 from public.published_maps where map_id = m.id)
     and public.site_live_map_count(m.facility_id, m.id) >= 2 then
    raise exception '“%” already has 2 live maps, the most a site can have. Take one offline from the Sites page, then publish this one.', site_name
      using errcode = '54000';
  end if;
  insert into public.published_maps (map_id, company_id, facility_id, name, doc, revision, published_at, published_by)
  values (m.id, m.company_id, m.facility_id, m.name, m.draft, m.revision, t, auth.uid())
  on conflict (map_id) do update set
    company_id = excluded.company_id, facility_id = excluded.facility_id, name = excluded.name, doc = excluded.doc,
    revision = excluded.revision, published_at = excluded.published_at, published_by = excluded.published_by;
  insert into public.map_versions (map_id, created_by, reason, label, revision, doc)
  values (m.id, auth.uid(), 'publish', 'Published', m.revision, m.draft);
  perform public.log_action(m.company_id, 'map.published', m.id::text, jsonb_build_object('name', m.name, 'revision', m.revision));
  return t;
end $$;

-- Takes a map offline: employees stop seeing it. The draft is kept.
create or replace function public.unpublish_map(p_map uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare m public.maps;
begin
  select * into m from public.maps where id = p_map;
  if m is null or not public.can_edit_facility(m.facility_id) then
    raise exception 'You don''t have permission to change this map.' using errcode = '42501';
  end if;
  delete from public.published_maps where map_id = m.id;
  if found then
    perform public.log_action(m.company_id, 'map.unpublished', m.id::text, jsonb_build_object('name', m.name));
  end if;
end $$;
revoke execute on function public.unpublish_map(uuid) from public, anon;
grant execute on function public.unpublish_map(uuid) to authenticated;
