-- Bergeron Maps admins (platform_admins) can see and manage every company:
-- all sites, all maps, all people. Everyone else is unchanged: access still
-- comes only from their own memberships.

create or replace function public.can_view_facility(p_facility uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_platform_admin() or exists (
    select 1 from public.facilities f
    join public.memberships m on m.company_id = f.company_id and m.user_id = auth.uid()
    where f.id = p_facility and (m.facility_ids is null or f.id = any (m.facility_ids))
  )
$$;

create or replace function public.can_view_facility_row(p_company uuid, p_facility uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_platform_admin() or exists (
    select 1 from public.memberships m
    where m.company_id = p_company and m.user_id = auth.uid()
      and (m.facility_ids is null or p_facility = any (m.facility_ids))
  )
$$;

create or replace function public.can_edit_facility(p_facility uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_platform_admin() or exists (
    select 1 from public.facilities f
    join public.memberships m on m.company_id = f.company_id and m.user_id = auth.uid()
    where f.id = p_facility
      and m.role in ('owner', 'manager')
      and (m.facility_ids is null or f.id = any (m.facility_ids))
  )
$$;

create or replace function public.can_manage_company(p_company uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_platform_admin() or exists (
    select 1 from public.memberships m
    where m.company_id = p_company and m.user_id = auth.uid()
      and (m.role = 'owner' or (m.role = 'manager' and m.facility_ids is null))
  )
$$;

create or replace function public.is_member(p_company uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_platform_admin() or exists (select 1 from public.memberships where company_id = p_company and user_id = auth.uid())
$$;

-- add_member/remove_member act on this. An admin who isn't a member of the
-- company acts as an owner of it.
create or replace function public.my_membership(p_company uuid)
returns public.memberships
language plpgsql stable security definer set search_path = public as $$
declare r public.memberships;
begin
  select * into r from public.memberships where company_id = p_company and user_id = auth.uid();
  if found then return r; end if;
  if public.is_platform_admin() and exists (select 1 from public.companies where id = p_company) then
    r.company_id := p_company;
    r.user_id := auth.uid();
    r.role := 'owner';
    r.facility_ids := null;
    return r;
  end if;
  return null;
end $$;

create or replace function public.list_members(p_company uuid)
returns table (user_id uuid, email text, role public.member_role, facility_ids uuid[], pending boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_platform_admin()
     and not exists (select 1 from public.memberships m where m.company_id = p_company and m.user_id = auth.uid() and m.role <> 'employee') then
    raise exception 'Only owners and managers can see who has access.' using errcode = '42501';
  end if;
  return query
    select m.user_id, u.email::text, m.role, m.facility_ids, false
    from public.memberships m join auth.users u on u.id = m.user_id where m.company_id = p_company
    union all
    select null::uuid, i.email, i.role, i.facility_ids, true from public.invitations i where i.company_id = p_company
    order by 5, 2;
end $$;

-- Everything at a glance, for admins only: each company with its sites and people.
create function public.admin_overview()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Only Bergeron Maps admins can see all accounts.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', c.id,
      'name', c.name,
      'created_at', c.created_at,
      'sites', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', f.id, 'name', f.name, 'slug', f.slug,
          'maps', (select count(*) from public.maps mp where mp.facility_id = f.id and mp.deleted_at is null),
          'published', (select count(*) from public.published_maps pm where pm.facility_id = f.id)
        ) order by f.name)
        from public.facilities f where f.company_id = c.id), '[]'::jsonb),
      'people', coalesce((
        select jsonb_agg(p order by p->>'pending', p->>'email')
        from (
          select jsonb_build_object('email', u.email, 'role', m.role, 'facility_ids', m.facility_ids, 'pending', false,
                                    'last_sign_in', u.last_sign_in_at) p
          from public.memberships m join auth.users u on u.id = m.user_id where m.company_id = c.id
          union all
          select jsonb_build_object('email', i.email, 'role', i.role, 'facility_ids', i.facility_ids, 'pending', true,
                                    'last_sign_in', null)
          from public.invitations i where i.company_id = c.id
        ) people), '[]'::jsonb)
    ) order by c.name)
    from public.companies c
  ), '[]'::jsonb);
end $$;
revoke execute on function public.admin_overview() from public, anon;
grant execute on function public.admin_overview() to authenticated;
