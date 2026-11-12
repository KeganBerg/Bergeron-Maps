-- Account backups: bring back a deleted company from a backup file.
--
-- The backup file itself is made in the browser from what admins can already
-- read (All accounts → Download backup), so exporting needs nothing new here.
-- Restoring does: it recreates rows with their original ids, which no client
-- may do, so it is done by two admin-only functions.
--
--   admin_restore_company(backup)  the company, its sites (same ids, links and
--                                  join codes where still free), people's access,
--                                  and every map with its published version.
--                                  All or nothing.
--   admin_restore_versions(map, versions)
--                                  a map's saved versions, sent in batches after
--                                  the company is back (they can be large).
--
-- A company that still exists is never overwritten: restore is for companies
-- that were deleted.

create or replace function public.admin_restore_company(p_backup jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c_id uuid;
  c_name text;
  s jsonb;
  p jsonb;
  m jsonb;
  pub jsonb;
  site_ids uuid[] := '{}';
  f_id uuid;
  want_slug text;
  got_slug text;
  want_code text;
  u_id uuid;
  em text;
  r public.member_role;
  fac uuid[];
  live integer;
  deleted_at_v timestamptz;
  map_rev integer;
  slug_changes jsonb := '[]';
  n_sites integer := 0;
  n_members integer := 0;
  n_invites integer := 0;
  n_maps integer := 0;
  n_published integer := 0;
  n_moved_to_trash integer := 0;
begin
  if not public.is_platform_admin() then
    raise exception 'Only Bergeron Maps admins can restore a company.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_backup) <> 'object' then
    raise exception 'That isn’t a company from a Bergeron Maps backup.' using errcode = '22023';
  end if;
  c_id := (p_backup ->> 'id')::uuid;
  c_name := trim(coalesce(p_backup ->> 'name', ''));
  if c_id is null or c_name = '' then
    raise exception 'That isn’t a company from a Bergeron Maps backup.' using errcode = '22023';
  end if;
  if exists (select 1 from public.companies where id = c_id) then
    raise exception '“%” is still in All accounts, so there is nothing to restore. Restore only brings back a deleted company.', c_name
      using errcode = '23505';
  end if;

  insert into public.companies (id, name, created_at, created_by)
  values (c_id, left(c_name, 120), coalesce((p_backup ->> 'created_at')::timestamptz, now()), auth.uid());

  -- Sites. The site limit is set at the end so it can't refuse the sites being restored.
  for s in select * from jsonb_array_elements(coalesce(p_backup -> 'sites', '[]')) loop
    f_id := (s ->> 'id')::uuid;
    if f_id is null or exists (select 1 from public.facilities where id = f_id) then
      raise exception 'The backup of “%” is damaged (a site is missing or repeated).', c_name using errcode = '22023';
    end if;
    want_slug := s ->> 'slug';
    if want_slug is null or exists (select 1 from public.facilities where slug = want_slug) then
      want_slug := null; -- the slug trigger picks the first free one from the name
    end if;
    insert into public.facilities (id, company_id, name, address, created_at, slug)
    values (f_id, c_id, left(trim(coalesce(s ->> 'name', 'Site')), 120), nullif(trim(coalesce(s ->> 'address', '')), ''),
            coalesce((s ->> 'created_at')::timestamptz, now()), want_slug)
    returning slug into got_slug;
    if got_slug is distinct from (s ->> 'slug') then
      slug_changes := slug_changes || jsonb_build_object('site', s ->> 'name', 'was', s ->> 'slug', 'now', got_slug);
    end if;
    -- Same join code, so printed signs keep working, unless another site has it now.
    want_code := s ->> 'join_code';
    if want_code ~ '^[A-HJ-NP-Z2-9]{6}$' and not exists (select 1 from public.facilities where join_code = want_code) then
      perform set_config('bm.allow_code_change', 'on', true);
      update public.facilities set join_code = want_code where id = f_id;
      perform set_config('bm.allow_code_change', 'off', true);
    end if;
    site_ids := site_ids || f_id;
    n_sites := n_sites + 1;
  end loop;

  -- People. Anyone who still has a sign-in gets their access back right away;
  -- the rest get it the first time they sign in, as with any invitation.
  for p in select * from jsonb_array_elements(coalesce(p_backup -> 'people', '[]')) loop
    em := lower(trim(coalesce(p ->> 'email', '')));
    if position('@' in em) <= 1 then continue; end if;
    r := case p ->> 'role' when 'owner' then 'owner' when 'manager' then 'manager' else 'employee' end::public.member_role;
    if jsonb_typeof(p -> 'facility_ids') = 'array' then
      fac := array(select x::uuid from jsonb_array_elements_text(p -> 'facility_ids') x where x::uuid = any (site_ids));
      if cardinality(fac) = 0 then continue; end if; -- their only sites aren't in the backup
    else
      fac := null;
    end if;
    select id into u_id from auth.users where lower(email) = em limit 1;
    if u_id is not null then
      insert into public.memberships (company_id, user_id, role, facility_ids) values (c_id, u_id, r, fac)
      on conflict (company_id, user_id) do nothing;
      if found then n_members := n_members + 1; end if;
    else
      insert into public.invitations (company_id, email, role, facility_ids, invited_by) values (c_id, em, r, fac, auth.uid())
      on conflict (company_id, email) do nothing;
      if found then n_invites := n_invites + 1; end if;
    end if;
  end loop;

  -- Maps, in their slots, with what employees saw. Dates of the maps themselves
  -- restart (the database keeps those honest); the saved versions keep theirs.
  for m in
    select * from jsonb_array_elements(coalesce(p_backup -> 'maps', '[]')) x
    order by (x ->> 'deleted_at') is not null, (x ->> 'slot')::int nulls last
  loop
    if (m ->> 'facility_id') is null or not ((m ->> 'facility_id')::uuid = any (site_ids)) then
      raise exception 'The backup of “%” is damaged (a map’s site is missing).', c_name using errcode = '22023';
    end if;
    if exists (select 1 from public.maps where id = (m ->> 'id')::uuid) then
      raise exception 'The backup of “%” is damaged (a map is repeated).', c_name using errcode = '22023';
    end if;
    deleted_at_v := (m ->> 'deleted_at')::timestamptz;
    -- A site holds 5 maps; any beyond that (only possible in old data) go to Recently deleted.
    if deleted_at_v is null and (select count(*) from public.maps where facility_id = (m ->> 'facility_id')::uuid and deleted_at is null) >= 5 then
      deleted_at_v := now();
      n_moved_to_trash := n_moved_to_trash + 1;
    end if;
    insert into public.maps (id, facility_id, name, draft, is_public, slot, deleted_at)
    values ((m ->> 'id')::uuid, (m ->> 'facility_id')::uuid, left(trim(coalesce(m ->> 'name', 'Map')), 120), m -> 'draft',
            coalesce((m ->> 'is_public')::boolean, false), (m ->> 'slot')::smallint, deleted_at_v)
    returning revision into map_rev;
    n_maps := n_maps + 1;

    pub := m -> 'published';
    if jsonb_typeof(pub) = 'object' and deleted_at_v is null then
      select count(*) into live from public.published_maps pm where pm.facility_id = (m ->> 'facility_id')::uuid;
      if live < 2 then
        insert into public.published_maps (map_id, company_id, facility_id, name, doc, revision, published_at, published_by)
        values ((m ->> 'id')::uuid, c_id, (m ->> 'facility_id')::uuid, left(coalesce(pub ->> 'name', m ->> 'name', 'Map'), 120), pub -> 'doc',
                -- Same draft as when it was published: no "unpublished changes" after the restore.
                case when (pub ->> 'revision')::int = (m ->> 'revision')::int then map_rev else 0 end,
                coalesce((pub ->> 'published_at')::timestamptz, now()), auth.uid());
        n_published := n_published + 1;
      end if;
    end if;
  end loop;

  update public.companies set max_sites = nullif(p_backup ->> 'max_sites', '')::integer where id = c_id;

  perform public.log_action(c_id, 'company.restored', c_id::text, jsonb_build_object(
    'name', c_name, 'exported_at', p_backup ->> 'exported_at', 'sites', n_sites, 'maps', n_maps));

  return jsonb_build_object(
    'company', c_id, 'name', c_name, 'sites', n_sites, 'members', n_members, 'invited', n_invites,
    'maps', n_maps, 'published', n_published, 'moved_to_trash', n_moved_to_trash, 'slug_changes', slug_changes);
end $$;

-- Adds saved versions back to a restored map. Versions already there are skipped,
-- so sending the same batch twice is harmless.
create or replace function public.admin_restore_versions(p_map uuid, p_versions jsonb)
returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if not public.is_platform_admin() then
    raise exception 'Only Bergeron Maps admins can restore a company.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.maps where id = p_map) then
    raise exception 'That map isn’t here. Restore its company first.' using errcode = '22023';
  end if;
  insert into public.map_versions (id, map_id, created_at, created_by, reason, label, revision, doc)
  select (v ->> 'id')::uuid, p_map, coalesce((v ->> 'created_at')::timestamptz, now()), null,
         case when v ->> 'reason' in ('auto', 'manual', 'before-restore', 'conflict', 'publish') then v ->> 'reason' else 'manual' end,
         left(coalesce(v ->> 'label', ''), 120), coalesce((v ->> 'revision')::int, 1), v -> 'doc'
  from jsonb_array_elements(coalesce(p_versions, '[]')) v
  where jsonb_typeof(v -> 'doc') = 'object' and (v ->> 'id') is not null
  on conflict (id) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

revoke execute on function public.admin_restore_company(jsonb), public.admin_restore_versions(uuid, jsonb) from public, anon;
grant execute on function public.admin_restore_company(jsonb), public.admin_restore_versions(uuid, jsonb) to authenticated;
