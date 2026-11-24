-- Restore part of a company from a backup: the maps and sites that are gone
-- while the company itself still exists (a map deleted forever, a site deleted).
--
--   admin_restore_missing(backup)  for one company from a backup file: every
--                                  site and map in the file whose id is no longer
--                                  in the database comes back with that id, so
--                                  links and QR signs keep working. Nothing that
--                                  still exists is touched. All or nothing.
--
-- Saved versions of the maps that came back are then sent with the existing
-- admin_restore_versions, as for a whole company.

create or replace function public.admin_restore_missing(p_backup jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c_id uuid;
  c_name text;
  s jsonb;
  p jsonb;
  m jsonb;
  pub jsonb;
  f_id uuid;
  new_sites uuid[] := '{}';
  restored_maps uuid[] := '{}';
  want_slug text;
  got_slug text;
  want_code text;
  em text;
  r public.member_role;
  fac uuid[];
  u_id uuid;
  mem public.memberships;
  deleted_at_v timestamptz;
  map_rev integer;
  live integer;
  slug_changes jsonb := '[]';
  n_access integer := 0;
  n_published integer := 0;
  n_moved_to_trash integer := 0;
begin
  if not public.is_platform_admin() then
    raise exception 'Only Bergeron Maps admins can restore from a backup.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_backup) <> 'object' then
    raise exception 'That isn’t a company from a Bergeron Maps backup.' using errcode = '22023';
  end if;
  c_id := (p_backup ->> 'id')::uuid;
  select name into c_name from public.companies where id = c_id;
  if c_name is null then
    raise exception 'That company isn’t in All accounts. Restore the whole company instead.' using errcode = '22023';
  end if;

  -- Sites that are gone, with the same id, link and join code where still free.
  for s in select * from jsonb_array_elements(coalesce(p_backup -> 'sites', '[]')) loop
    f_id := (s ->> 'id')::uuid;
    if f_id is null or exists (select 1 from public.facilities where id = f_id) then continue; end if;
    want_slug := s ->> 'slug';
    if want_slug is null or exists (select 1 from public.facilities where slug = want_slug) then
      want_slug := null;
    end if;
    insert into public.facilities (id, company_id, name, address, created_at, slug)
    values (f_id, c_id, left(trim(coalesce(s ->> 'name', 'Site')), 120), nullif(trim(coalesce(s ->> 'address', '')), ''),
            coalesce((s ->> 'created_at')::timestamptz, now()), want_slug)
    returning slug into got_slug;
    if got_slug is distinct from (s ->> 'slug') then
      slug_changes := slug_changes || jsonb_build_object('site', s ->> 'name', 'was', s ->> 'slug', 'now', got_slug);
    end if;
    want_code := s ->> 'join_code';
    if want_code ~ '^[A-HJ-NP-Z2-9]{6}$' and not exists (select 1 from public.facilities where join_code = want_code) then
      perform set_config('bm.allow_code_change', 'on', true);
      update public.facilities set join_code = want_code where id = f_id;
      perform set_config('bm.allow_code_change', 'off', true);
    end if;
    new_sites := new_sites || f_id;
  end loop;

  -- Access to the sites that came back, for the people who had it in the backup.
  -- Nobody else's access changes, and nobody gets more than the backup gave them.
  if cardinality(new_sites) > 0 then
    for p in select * from jsonb_array_elements(coalesce(p_backup -> 'people', '[]')) loop
      em := lower(trim(coalesce(p ->> 'email', '')));
      if position('@' in em) <= 1 or jsonb_typeof(p -> 'facility_ids') <> 'array' then continue; end if;
      fac := array(select x::uuid from jsonb_array_elements_text(p -> 'facility_ids') x where x::uuid = any (new_sites));
      if cardinality(fac) = 0 then continue; end if;
      r := case p ->> 'role' when 'owner' then 'owner' when 'manager' then 'manager' else 'employee' end::public.member_role;
      select id into u_id from auth.users where lower(email) = em limit 1;
      mem := null;
      if u_id is not null then
        select * into mem from public.memberships where company_id = c_id and user_id = u_id;
      end if;
      if mem.id is not null then
        -- Still in the company: add the sites back unless they already see every site.
        if mem.facility_ids is not null then
          update public.memberships set facility_ids = array(select distinct unnest(facility_ids || fac)) where id = mem.id;
          n_access := n_access + 1;
        end if;
      elsif exists (select 1 from public.invitations where company_id = c_id and email = em and facility_ids is not null) then
        update public.invitations set facility_ids = array(select distinct unnest(facility_ids || fac)) where company_id = c_id and email = em;
        n_access := n_access + 1;
      elsif not exists (select 1 from public.invitations where company_id = c_id and email = em) then
        -- They left the company with the site: back with that site only.
        if u_id is not null then
          insert into public.memberships (company_id, user_id, role, facility_ids) values (c_id, u_id, r, fac)
          on conflict (company_id, user_id) do nothing;
        else
          insert into public.invitations (company_id, email, role, facility_ids, invited_by) values (c_id, em, r, fac, auth.uid())
          on conflict (company_id, email) do nothing;
        end if;
        if found then n_access := n_access + 1; end if;
      end if;
    end loop;
  end if;

  -- Maps that are gone, into a free slot of their site, else into Recently deleted.
  for m in
    select * from jsonb_array_elements(coalesce(p_backup -> 'maps', '[]')) x
    order by (x ->> 'deleted_at') is not null, (x ->> 'slot')::int nulls last
  loop
    if (m ->> 'id') is null or exists (select 1 from public.maps where id = (m ->> 'id')::uuid) then continue; end if;
    if not exists (select 1 from public.facilities where id = (m ->> 'facility_id')::uuid and company_id = c_id) then
      continue; -- its site is in another company now, or not in the backup
    end if;
    deleted_at_v := (m ->> 'deleted_at')::timestamptz;
    -- A map that was in Recently deleted gets at least a day there before it is emptied.
    if deleted_at_v is not null then
      deleted_at_v := greatest(deleted_at_v, now() - interval '29 days');
    elsif (select count(*) from public.maps where facility_id = (m ->> 'facility_id')::uuid and deleted_at is null) >= 5 then
      deleted_at_v := now();
      n_moved_to_trash := n_moved_to_trash + 1;
    end if;
    insert into public.maps (id, facility_id, name, draft, is_public, slot, deleted_at)
    values ((m ->> 'id')::uuid, (m ->> 'facility_id')::uuid, left(trim(coalesce(m ->> 'name', 'Map')), 120), m -> 'draft',
            coalesce((m ->> 'is_public')::boolean, false), (m ->> 'slot')::smallint, deleted_at_v)
    returning revision into map_rev;
    restored_maps := restored_maps || (m ->> 'id')::uuid;

    pub := m -> 'published';
    if jsonb_typeof(pub) = 'object' and deleted_at_v is null then
      select count(*) into live from public.published_maps pm where pm.facility_id = (m ->> 'facility_id')::uuid;
      if live < 2 then
        insert into public.published_maps (map_id, company_id, facility_id, name, doc, revision, published_at, published_by)
        values ((m ->> 'id')::uuid, c_id, (m ->> 'facility_id')::uuid, left(coalesce(pub ->> 'name', m ->> 'name', 'Map'), 120), pub -> 'doc',
                case when (pub ->> 'revision')::int = (m ->> 'revision')::int then map_rev else 0 end,
                coalesce((pub ->> 'published_at')::timestamptz, now()), auth.uid());
        n_published := n_published + 1;
      end if;
    end if;
  end loop;

  if cardinality(new_sites) + cardinality(restored_maps) > 0 then
    perform public.log_action(c_id, 'company.restored_missing', c_id::text, jsonb_build_object(
      'exported_at', p_backup ->> 'exported_at', 'sites', cardinality(new_sites), 'maps', cardinality(restored_maps)));
  end if;

  return jsonb_build_object(
    'company', c_id, 'name', c_name, 'sites', cardinality(new_sites), 'maps', cardinality(restored_maps),
    'map_ids', to_jsonb(restored_maps), 'access', n_access, 'published', n_published,
    'moved_to_trash', n_moved_to_trash, 'slug_changes', slug_changes);
end $$;

revoke execute on function public.admin_restore_missing(jsonb) from public, anon;
grant execute on function public.admin_restore_missing(jsonb) to authenticated;
