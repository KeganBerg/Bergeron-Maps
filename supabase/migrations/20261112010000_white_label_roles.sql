-- White-label roles and site workflow (2026-11-12). Builds on the existing
-- companies, sites (facilities), memberships, invitations and join codes.
--
-- (a) Contract setup, by Bergeron Maps admins only: an account lead email when
--     a company is set up, the contracted site limit, and each site's address.
--     Customers can no longer change a site's address.
-- (b) Request Manager Status: someone on the employee screen asks for manager
--     access to a site they joined; an owner, regional manager or admin
--     approves or denies it in one tap. Nobody can give themselves a role.
-- (c) Transfers: an owner or regional manager moves a site manager (or an
--     employee) from one site to another in one step.
-- (d) Removing someone also signs them out on every device. Their access
--     already stopped at once (every request checks memberships); now their
--     sign-in ends too, so they must sign in again.
-- (e) My Locations: every site a person has joined, across companies, and
--     leaving a site they joined.
-- (f) Public site links: …/#/view/<site-link> shows the site's public, live
--     maps to anyone, with no sign-in.
-- (g) Deleting from All accounts: admins can delete a whole company (typing
--     its name to confirm) and a site. A site that still has maps can't be
--     deleted (step 9); its maps must be deleted or moved first. Deleting a
--     site also takes it out of everyone's access. Nobody can remove
--     themselves from a company, so an admin can't lock themselves out.

-- ------------------------------------------------------------------ (a)

-- Addresses come from the contract, so only admins set them.
create or replace function public.facilities_protect_address()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (tg_op = 'INSERT' and new.address is not null or tg_op = 'UPDATE' and new.address is distinct from old.address)
     and auth.uid() is not null and not public.is_platform_admin() then
    raise exception 'Site addresses come from your contract. Ask Bergeron Maps to change one.' using errcode = '42501';
  end if;
  new.address := nullif(trim(new.address), '');
  return new;
end $$;
revoke execute on function public.facilities_protect_address() from public, anon, authenticated;
drop trigger if exists facilities_protect_address on public.facilities;
create trigger facilities_protect_address before insert or update of address on public.facilities
for each row execute function public.facilities_protect_address();

-- Sets the contracted number of sites. null = no limit.
create or replace function public.set_site_limit(p_company uuid, p_max_sites integer)
returns void
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if not public.is_platform_admin() then
    raise exception 'Only Bergeron Maps admins can change a contract.' using errcode = '42501';
  end if;
  if p_max_sites is not null and p_max_sites < 1 then
    raise exception 'A contract needs at least 1 site.' using errcode = '22023';
  end if;
  select count(*) into n from public.facilities where company_id = p_company;
  if p_max_sites is not null and p_max_sites < n then
    raise exception 'This company already has % sites. Remove sites before lowering the limit to %.', n, p_max_sites using errcode = '22023';
  end if;
  update public.companies set max_sites = p_max_sites where id = p_company;
  if not found then raise exception 'Company not found.' using errcode = '22023'; end if;
  perform public.log_action(p_company, 'company.site_limit_changed', p_company::text, jsonb_build_object('max_sites', p_max_sites));
end $$;

create or replace function public.set_site_address(p_facility uuid, p_address text)
returns void
language plpgsql security definer set search_path = public as $$
declare c uuid;
begin
  if not public.is_platform_admin() then
    raise exception 'Site addresses come from your contract. Ask Bergeron Maps to change one.' using errcode = '42501';
  end if;
  if char_length(coalesce(p_address, '')) > 300 then
    raise exception 'That address is too long.' using errcode = '22023';
  end if;
  update public.facilities set address = p_address where id = p_facility returning company_id into c;
  if c is null then raise exception 'Site not found.' using errcode = '22023'; end if;
  perform public.log_action(c, 'site.address_changed', p_facility::text, jsonb_build_object('address', nullif(trim(p_address), '')));
end $$;

-- Adds a contracted site (name and address). Admins only; the site limit still applies.
create or replace function public.add_contract_site(p_company uuid, p_name text, p_address text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare f uuid;
begin
  if not public.is_platform_admin() then
    raise exception 'Only Bergeron Maps admins can add a contracted site.' using errcode = '42501';
  end if;
  insert into public.facilities (company_id, name, address) values (p_company, trim(p_name), p_address) returning id into f;
  perform public.log_action(p_company, 'site.created', f::text, jsonb_build_object('name', trim(p_name), 'address', nullif(trim(p_address), '')));
  return f;
end $$;

-- New company from a signed contract: name, first site and its address, the
-- site limit, and the account lead (the client's top-level manager), who is
-- given owner access to every site. Without a lead the admin is the owner,
-- as before.
create or replace function public.setup_company(p_name text, p_site_name text, p_site_address text default null,
  p_lead_email text default null, p_max_sites integer default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare c uuid; lead text := nullif(lower(trim(coalesce(p_lead_email, ''))), '');
begin
  if auth.uid() is null then raise exception 'Please sign in first.' using errcode = '42501'; end if;
  if not public.is_platform_admin() then
    raise exception 'Only Bergeron Maps admins can set up a new company.' using errcode = '42501';
  end if;
  if p_max_sites is not null and p_max_sites < 1 then
    raise exception 'A contract needs at least 1 site.' using errcode = '22023';
  end if;
  if lead is not null and lead !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'The account lead email doesn''t look like an email address.' using errcode = '22023';
  end if;
  insert into public.companies (name, created_by, max_sites) values (trim(p_name), auth.uid(), p_max_sites) returning id into c;
  if lead is null then
    insert into public.memberships (company_id, user_id, role) values (c, auth.uid(), 'owner');
  end if;
  insert into public.facilities (company_id, name, address) values (c, trim(p_site_name), p_site_address);
  perform public.log_action(c, 'company.created', c::text, jsonb_build_object('name', trim(p_name), 'max_sites', p_max_sites));
  if lead is not null then
    -- The admin counts as an owner here (my_membership), so add_member's rules apply unchanged.
    perform public.add_member(c, lead, 'owner', null);
  end if;
  return c;
end $$;

grant execute on function public.set_site_limit(uuid, integer), public.set_site_address(uuid, text),
  public.add_contract_site(uuid, text, text), public.setup_company(text, text, text, text, integer) to authenticated;

-- ------------------------------------------------------------------ (b)

create table if not exists public.manager_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  facility_id uuid not null references public.facilities (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  email text not null,
  note text check (note is null or char_length(note) <= 300),
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  created_at timestamptz not null default now(),
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz
);
create unique index if not exists manager_requests_one_pending on public.manager_requests (user_id, facility_id) where status = 'pending';
create index if not exists manager_requests_company on public.manager_requests (company_id, status);
alter table public.manager_requests enable row level security;
revoke all on public.manager_requests from anon, authenticated;
grant select on public.manager_requests to authenticated;
drop policy if exists manager_requests_read on public.manager_requests;
create policy manager_requests_read on public.manager_requests for select to authenticated
  using (user_id = auth.uid() or public.can_manage_company(company_id));

-- Asks for manager access to a site the person already belongs to (as an
-- employee, usually after joining with the site code).
create or replace function public.request_manager_access(p_facility uuid, p_note text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare f public.facilities; m public.memberships; r uuid; v_email text;
begin
  if auth.uid() is null then raise exception 'Please sign in first.' using errcode = '42501'; end if;
  select * into f from public.facilities where id = p_facility;
  if f.id is null or not public.can_view_facility(p_facility) then
    raise exception 'Join this site with its code first, then ask for manager access.' using errcode = '42501';
  end if;
  if public.can_edit_facility(p_facility) then
    raise exception 'You already manage this site.' using errcode = '22023';
  end if;
  -- No flooding: a person can have at most 3 open requests.
  if (select count(*) from public.manager_requests where user_id = auth.uid() and status = 'pending') >= 3 then
    raise exception 'You already have 3 requests waiting. Wait for an answer first.' using errcode = '54000';
  end if;
  select email into v_email from auth.users where id = auth.uid();
  select id into r from public.manager_requests where user_id = auth.uid() and facility_id = p_facility and status = 'pending';
  if r is not null then return r; end if;
  insert into public.manager_requests (company_id, facility_id, user_id, email, note)
  values (f.company_id, f.id, auth.uid(), lower(v_email), nullif(left(trim(coalesce(p_note, '')), 300), ''))
  returning id into r;
  perform public.log_action(f.company_id, 'member.manager_requested', lower(v_email), jsonb_build_object('facility_id', f.id));
  return r;
end $$;

-- Approve: the person becomes the manager of that site (only that site; a
-- membership has one role, so their employee access elsewhere in the
-- company is replaced). Deny: nothing changes.
create or replace function public.decide_manager_request(p_request uuid, p_approve boolean)
returns void
language plpgsql security definer set search_path = public as $$
declare q public.manager_requests; m public.memberships;
begin
  select * into q from public.manager_requests where id = p_request for update;
  if q.id is null or not public.can_manage_company(q.company_id) then
    raise exception 'Only owners and regional managers can answer manager requests.' using errcode = '42501';
  end if;
  if q.status <> 'pending' then
    raise exception 'This request was already answered.' using errcode = '22023';
  end if;
  if p_approve then
    select * into m from public.memberships where company_id = q.company_id and user_id = q.user_id;
    if m.id is null then
      insert into public.memberships (company_id, user_id, role, facility_ids) values (q.company_id, q.user_id, 'manager', array[q.facility_id]);
    elsif m.role = 'employee' then
      update public.memberships set role = 'manager', facility_ids = array[q.facility_id] where id = m.id;
    elsif m.role = 'manager' and m.facility_ids is not null and not (q.facility_id = any (m.facility_ids)) then
      -- Already manages other sites: add this one.
      update public.memberships set facility_ids = facility_ids || q.facility_id where id = m.id;
    end if;
    -- Owners and regional managers already manage every site: nothing to change.
  end if;
  update public.manager_requests set status = case when p_approve then 'approved' else 'denied' end,
    decided_by = auth.uid(), decided_at = now() where id = q.id;
  perform public.log_action(q.company_id, case when p_approve then 'member.manager_approved' else 'member.manager_denied' end,
    q.email, jsonb_build_object('facility_id', q.facility_id));
end $$;

grant execute on function public.request_manager_access(uuid, text), public.decide_manager_request(uuid, boolean) to authenticated;

-- ------------------------------------------------------------------ (c)

-- Moves someone from one site to another, keeping their role. Works for
-- people who haven't signed in yet (invitations) too.
create or replace function public.move_member(p_company uuid, p_email text, p_from uuid, p_to uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(trim(p_email));
  m public.memberships;
  inv public.invitations;
  ids uuid[];
begin
  if not public.can_manage_company(p_company) then
    raise exception 'Only owners and regional managers can move people between sites.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.facilities where id = p_to and company_id = p_company)
     or not exists (select 1 from public.facilities where id = p_from and company_id = p_company) then
    raise exception 'Both sites must be part of this company.' using errcode = '22023';
  end if;
  select m2.* into m from public.memberships m2 join auth.users u on u.id = m2.user_id
  where m2.company_id = p_company and lower(u.email) = v_email;
  if m.id is not null then
    if m.facility_ids is null then
      raise exception 'This person already has every site. Change their access instead.' using errcode = '22023';
    end if;
    if not (p_from = any (m.facility_ids)) then
      raise exception 'This person isn''t at that site.' using errcode = '22023';
    end if;
    ids := array(select distinct x from unnest(array_replace(m.facility_ids, p_from, p_to)) x);
    update public.memberships set facility_ids = ids where id = m.id;
  else
    select * into inv from public.invitations where company_id = p_company and email = v_email;
    if inv.id is null then raise exception 'Nobody with that email has access here.' using errcode = '22023'; end if;
    if inv.facility_ids is null or not (p_from = any (inv.facility_ids)) then
      raise exception 'This person isn''t at that site.' using errcode = '22023';
    end if;
    ids := array(select distinct x from unnest(array_replace(inv.facility_ids, p_from, p_to)) x);
    update public.invitations set facility_ids = ids where id = inv.id;
  end if;
  -- Requests for the old site no longer make sense.
  update public.manager_requests set status = 'denied', decided_by = auth.uid(), decided_at = now()
  where company_id = p_company and lower(email) = v_email and facility_id = p_from and status = 'pending';
  perform public.log_action(p_company, 'member.moved', v_email, jsonb_build_object('from', p_from, 'to', p_to));
end $$;
grant execute on function public.move_member(uuid, text, uuid, uuid) to authenticated;

-- ------------------------------------------------------------------ (d)

-- Ends every sign-in a person has (all devices). On plain Postgres (tests)
-- there is no auth.sessions table, and nothing happens.
create or replace function public.end_sessions(p_user uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if to_regclass('auth.sessions') is not null then
    begin
      execute 'delete from auth.sessions where user_id = $1' using p_user;
    exception when others then
      -- Access is already gone (every request checks memberships); a failure
      -- here must not undo the removal.
      raise warning 'Could not end sessions: %', sqlerrm;
    end;
  end if;
end $$;
revoke execute on function public.end_sessions(uuid) from public, anon, authenticated;

-- Same rules as 20261101000000, plus: signs the person out everywhere.
create or replace function public.remove_member(p_company uuid, p_user uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  me public.memberships := public.my_membership(p_company);
  them public.memberships;
begin
  select * into them from public.memberships where company_id = p_company and user_id = p_user;
  if them is null then return; end if;
  if me is null or me.role = 'employee' then
    raise exception 'Only owners and managers can remove people.' using errcode = '42501';
  end if;
  if them.role = 'owner' and me.role <> 'owner' then
    raise exception 'Only an owner can remove an owner.' using errcode = '42501';
  end if;
  if me.facility_ids is not null and (them.role <> 'employee' or them.facility_ids is null or not (them.facility_ids <@ me.facility_ids)) then
    raise exception 'You can only remove employees at facilities you manage.' using errcode = '42501';
  end if;
  if them.role = 'owner' and (select count(*) from public.memberships where company_id = p_company and role = 'owner') = 1 then
    raise exception 'A company needs at least one owner. Add another owner first.' using errcode = '42501';
  end if;
  if p_user = auth.uid() then
    raise exception 'You can''t remove yourself. Ask another owner or Bergeron Maps.' using errcode = '42501';
  end if;
  delete from public.memberships where id = them.id;
  update public.manager_requests set status = 'denied', decided_by = auth.uid(), decided_at = now()
  where company_id = p_company and user_id = p_user and status = 'pending';
  perform public.end_sessions(p_user);
  perform public.log_action(p_company, 'member.removed', (select email from auth.users where id = p_user),
    jsonb_build_object('role', them.role));
end $$;

-- ------------------------------------------------------------------ (e)

create or replace function public.my_locations()
returns table (company_id uuid, company_name text, site_id uuid, site_name text, slug text, address text,
  role public.member_role, live_maps integer, request_status text)
language sql stable security definer set search_path = public as $$
  select c.id, c.name, f.id, f.name, f.slug, f.address, m.role,
    (select count(*)::integer from public.published_maps p join public.maps mp on mp.id = p.map_id
      where p.facility_id = f.id and mp.deleted_at is null),
    (select q.status from public.manager_requests q where q.user_id = auth.uid() and q.facility_id = f.id
      order by q.created_at desc limit 1)
  from public.memberships m
  join public.companies c on c.id = m.company_id
  join public.facilities f on f.company_id = m.company_id and (m.facility_ids is null or f.id = any (m.facility_ids))
  where m.user_id = auth.uid()
  order by c.name, f.name
$$;

-- An employee leaves a site they joined. Managers ask their regional manager instead.
create or replace function public.leave_site(p_facility uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare m public.memberships; c uuid;
begin
  select company_id into c from public.facilities where id = p_facility;
  select * into m from public.memberships where company_id = c and user_id = auth.uid();
  if m.id is null then return; end if;
  if m.role <> 'employee' then
    raise exception 'Managers can''t leave a site themselves. Ask your regional manager to change your access.' using errcode = '42501';
  end if;
  if m.facility_ids is null then
    raise exception 'You were given every site in this company, so you can''t leave just one. Ask your manager to change your access.' using errcode = '42501';
  end if;
  if array_length(array_remove(m.facility_ids, p_facility), 1) is null then
    delete from public.memberships where id = m.id;
  else
    update public.memberships set facility_ids = array_remove(facility_ids, p_facility) where id = m.id;
  end if;
  update public.manager_requests set status = 'denied', decided_at = now()
  where user_id = auth.uid() and facility_id = p_facility and status = 'pending';
  perform public.log_action(c, 'site.left', p_facility::text);
end $$;

grant execute on function public.my_locations(), public.leave_site(uuid) to authenticated;

-- ------------------------------------------------------------------ (f)

-- The public maps of one site, by its link name. Only maps a manager made
-- public, only the published version, never anything in the trash.
create or replace function public.get_public_site(p_slug text)
returns table (site_name text, map_id uuid, name text, doc jsonb, published_at timestamptz)
language sql stable security definer set search_path = public as $$
  select f.name, p.map_id, p.name, p.doc, p.published_at
  from public.facilities f
  join public.published_maps p on p.facility_id = f.id
  join public.maps m on m.id = p.map_id
  where f.slug = lower(trim(p_slug)) and m.is_public and m.deleted_at is null
  order by p.name
$$;
grant execute on function public.get_public_site(text) to anon, authenticated;

-- ------------------------------------------------------------------ (g)

-- A deleted site is taken out of everyone's access. People left with no site
-- in that company lose their membership (and are signed out).
create or replace function public.facilities_after_delete()
returns trigger
language plpgsql security definer set search_path = public as $$
declare gone uuid;
begin
  -- When the whole company is being deleted, its memberships go with it.
  if not exists (select 1 from public.companies where id = old.company_id) then
    return null;
  end if;
  update public.memberships set facility_ids = array_remove(facility_ids, old.id)
  where company_id = old.company_id and old.id = any (facility_ids);
  for gone in
    delete from public.memberships where company_id = old.company_id and facility_ids = '{}'::uuid[] returning user_id
  loop
    perform public.end_sessions(gone);
  end loop;
  update public.invitations set facility_ids = array_remove(facility_ids, old.id)
  where company_id = old.company_id and old.id = any (facility_ids);
  delete from public.invitations where company_id = old.company_id and facility_ids = '{}'::uuid[];
  perform public.log_action(old.company_id, 'site.deleted', old.id::text, jsonb_build_object('name', old.name));
  return null;
end $$;
drop trigger if exists facilities_after_delete on public.facilities;
create trigger facilities_after_delete after delete on public.facilities
for each row execute function public.facilities_after_delete();

-- Admins delete a site. Refused while it still has maps (including Recently deleted).
create or replace function public.admin_delete_site(p_facility uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare n integer; site_name text;
begin
  if not public.is_platform_admin() then
    raise exception 'Only Bergeron Maps admins can delete sites here.' using errcode = '42501';
  end if;
  select name into site_name from public.facilities where id = p_facility;
  if site_name is null then return; end if;
  select count(*) into n from public.maps where facility_id = p_facility;
  if n > 0 then
    raise exception '“%” still has % map(s), counting Recently deleted. Delete or move them first.', site_name, n using errcode = '23503';
  end if;
  delete from public.facilities where id = p_facility;
end $$;

-- Admins delete a whole company: its sites, maps, history, people's access and
-- join codes, for good. The exact company name must be typed to confirm.
create or replace function public.admin_delete_company(p_company uuid, p_confirm_name text)
returns void
language plpgsql security definer set search_path = public as $$
declare c public.companies; people uuid[];
begin
  if not public.is_platform_admin() then
    raise exception 'Only Bergeron Maps admins can delete a company.' using errcode = '42501';
  end if;
  select * into c from public.companies where id = p_company;
  if c.id is null then return; end if;
  if trim(coalesce(p_confirm_name, '')) <> c.name then
    raise exception 'Type the company name exactly as shown to confirm.' using errcode = '22023';
  end if;
  people := array(select user_id from public.memberships where company_id = p_company and user_id <> auth.uid());
  delete from public.companies where id = p_company;
  -- Kept after the company is gone (its own log rows go with it).
  perform public.log_action(null, 'company.deleted', p_company::text, jsonb_build_object('name', c.name));
  perform public.end_sessions(u) from unnest(people) u;
end $$;

grant execute on function public.admin_delete_site(uuid), public.admin_delete_company(uuid, text) to authenticated;

-- ---------------------------------------------- admin overview, extended
-- Same as 20261101020000, plus the site limit, addresses, public maps and
-- open manager requests.
create or replace function public.admin_overview()
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
      'max_sites', c.max_sites,
      'sites', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', f.id, 'name', f.name, 'slug', f.slug, 'address', f.address,
          'maps', (select count(*) from public.maps mp where mp.facility_id = f.id and mp.deleted_at is null),
          'trashed', (select count(*) from public.maps mp where mp.facility_id = f.id and mp.deleted_at is not null),
          'published', (select count(*) from public.published_maps pm where pm.facility_id = f.id),
          'public', (select count(*) from public.published_maps pm join public.maps mp on mp.id = pm.map_id
                     where pm.facility_id = f.id and mp.is_public and mp.deleted_at is null)
        ) order by f.name)
        from public.facilities f where f.company_id = c.id), '[]'::jsonb),
      'people', coalesce((
        select jsonb_agg(p order by p->>'pending', p->>'email')
        from (
          select jsonb_build_object('user_id', m.user_id, 'email', u.email, 'role', m.role, 'facility_ids', m.facility_ids, 'pending', false,
                                    'last_sign_in', u.last_sign_in_at) p
          from public.memberships m join auth.users u on u.id = m.user_id where m.company_id = c.id
          union all
          select jsonb_build_object('user_id', null, 'email', i.email, 'role', i.role, 'facility_ids', i.facility_ids, 'pending', true,
                                    'last_sign_in', null)
          from public.invitations i where i.company_id = c.id
        ) people), '[]'::jsonb),
      'requests', coalesce((
        select jsonb_agg(jsonb_build_object('id', q.id, 'email', q.email, 'facility_id', q.facility_id, 'note', q.note,
                                            'created_at', q.created_at) order by q.created_at)
        from public.manager_requests q where q.company_id = c.id and q.status = 'pending'), '[]'::jsonb)
    ) order by c.name)
    from public.companies c
  ), '[]'::jsonb);
end $$;

-- ---------------------------------------------------------- privileges
-- Supabase grants new functions to everyone by default: take that back, then
-- give each function only to who needs it (as granted above).
revoke execute on function
  public.facilities_protect_address(), public.end_sessions(uuid), public.facilities_after_delete(),
  public.admin_delete_site(uuid), public.admin_delete_company(uuid, text),
  public.set_site_limit(uuid, integer), public.set_site_address(uuid, text), public.add_contract_site(uuid, text, text),
  public.setup_company(text, text, text, text, integer), public.request_manager_access(uuid, text),
  public.decide_manager_request(uuid, boolean), public.move_member(uuid, text, uuid, uuid),
  public.my_locations(), public.leave_site(uuid), public.get_public_site(text), public.admin_overview(), public.remove_member(uuid, uuid)
from public, anon;
revoke execute on function public.facilities_protect_address(), public.end_sessions(uuid), public.facilities_after_delete() from authenticated;
grant execute on function
  public.set_site_limit(uuid, integer), public.set_site_address(uuid, text), public.add_contract_site(uuid, text, text),
  public.setup_company(text, text, text, text, integer), public.request_manager_access(uuid, text),
  public.decide_manager_request(uuid, boolean), public.move_member(uuid, text, uuid, uuid),
  public.my_locations(), public.leave_site(uuid), public.admin_overview(), public.remove_member(uuid, uuid),
  public.admin_delete_site(uuid), public.admin_delete_company(uuid, text)
to authenticated;
grant execute on function public.get_public_site(text) to anon, authenticated;
