-- One live map per site (was 2).
--
-- A company pays per location, and a site is one location. With 2 live maps a buyer could run a second,
-- separate location under one paid site, so only 1 map per site can be live now. The 5 saved map slots
-- stay, so a spare layout can still be kept ready and swapped in. Sites that already have 2 live maps
-- keep them and can keep publishing changes to them, but no other map goes live there until they are
-- down to none. All accounts flags them (src/model/siteReview.ts).
--
-- Only the two limit checks change: the bodies below are the ones from 20261109000000 with 2 -> 1.

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
     and public.site_live_map_count(new.facility_id, new.id) >= 1 then
    raise exception '“%” already has 1 live map, the most a site can have. Take that one offline first.', site_name using errcode = '54000';
  end if;
  return new;
end $$;

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
     and public.site_live_map_count(m.facility_id, m.id) >= 1 then
    raise exception '“%” already has 1 live map, the most a site can have. Take that one offline from the Sites page, then publish this one.', site_name
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

-- Company setup after buying online. A self-serve buyer has no contract for us to copy addresses
-- from, so the account lead gives each site's address once, on the setup screen. After that it is
-- locked like a contract address: only Bergeron Maps admins change it, so a paid site can't be
-- quietly moved to another location.
create or replace function public.facilities_protect_address()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (tg_op = 'INSERT' and new.address is not null or tg_op = 'UPDATE' and new.address is distinct from old.address)
     and auth.uid() is not null and not public.is_platform_admin()
     and not ((tg_op = 'INSERT' or nullif(trim(old.address), '') is null) and public.can_manage_company(new.company_id)) then
    raise exception 'A site''s address is set once. Ask Bergeron Maps to change it.' using errcode = '42501';
  end if;
  new.address := nullif(trim(new.address), '');
  return new;
end $$;
