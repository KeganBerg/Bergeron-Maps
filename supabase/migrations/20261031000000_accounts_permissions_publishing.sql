-- Phase 2: companies, facilities, memberships, maps, versions, publishing, audit.
--
-- Security model: every table has row-level security. The browser talks to
-- the database with the user's own session, so these policies (not the UI)
-- decide what each person can read or change. Operations that touch several
-- tables or need extra rules (adding members, publishing) go through
-- SECURITY DEFINER functions that check permissions themselves.

create extension if not exists pgcrypto;

create type public.member_role as enum ('owner', 'manager', 'employee');

-- ---------------------------------------------------------------- tables

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null
);

create table public.facilities (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  created_at timestamptz not null default now()
);
create index on public.facilities (company_id);

-- One row per person per company. facility_ids = null means "all facilities
-- in the company"; otherwise access is limited to the listed facilities.
create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.member_role not null,
  facility_ids uuid[],
  created_at timestamptz not null default now(),
  unique (company_id, user_id)
);
create index on public.memberships (user_id);

-- Access granted to an email address that has no account yet. Converted to a
-- membership automatically when that person signs up.
create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  email text not null check (email = lower(email) and position('@' in email) > 1),
  role public.member_role not null,
  facility_ids uuid[],
  invited_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (company_id, email)
);

create table public.maps (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  facility_id uuid not null references public.facilities (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  -- The editor's working copy. Employees never read this; they read published_maps.
  draft jsonb not null,
  -- Bumped by trigger on every draft change; saves must name the revision they were based on.
  revision integer not null default 1,
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  deleted_at timestamptz
);
create index on public.maps (facility_id);

-- The version employees see. Replaced only by publish_map().
create table public.published_maps (
  map_id uuid primary key references public.maps (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  facility_id uuid not null references public.facilities (id) on delete cascade,
  name text not null,
  doc jsonb not null,
  revision integer not null,
  published_at timestamptz not null default now(),
  published_by uuid references auth.users (id) on delete set null
);

create table public.map_versions (
  id uuid primary key default gen_random_uuid(),
  map_id uuid not null references public.maps (id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  reason text not null check (reason in ('auto', 'manual', 'before-restore', 'conflict', 'publish')),
  label text not null check (char_length(label) <= 120),
  revision integer not null,
  doc jsonb not null
);
create index on public.map_versions (map_id, created_at desc);

create table public.audit_log (
  id bigint generated always as identity primary key,
  company_id uuid references public.companies (id) on delete cascade,
  actor uuid default auth.uid(),
  action text not null,
  target text,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index on public.audit_log (company_id, created_at desc);

-- ------------------------------------------------------- permission helpers
-- SECURITY DEFINER so policies can consult memberships without recursion.

create function public.my_membership(p_company uuid)
returns public.memberships
language sql stable security definer set search_path = public as $$
  select * from public.memberships where company_id = p_company and user_id = auth.uid()
$$;

create function public.can_view_facility(p_facility uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.facilities f
    join public.memberships m on m.company_id = f.company_id and m.user_id = auth.uid()
    where f.id = p_facility and (m.facility_ids is null or f.id = any (m.facility_ids))
  )
$$;

-- Same check from a facility row's own columns (usable while the row is being inserted).
create function public.can_view_facility_row(p_company uuid, p_facility uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.memberships m
    where m.company_id = p_company and m.user_id = auth.uid()
      and (m.facility_ids is null or p_facility = any (m.facility_ids))
  )
$$;

create function public.can_edit_facility(p_facility uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.facilities f
    join public.memberships m on m.company_id = f.company_id and m.user_id = auth.uid()
    where f.id = p_facility
      and m.role in ('owner', 'manager')
      and (m.facility_ids is null or f.id = any (m.facility_ids))
  )
$$;

-- Owners, and managers whose access covers the whole company.
create function public.can_manage_company(p_company uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.memberships m
    where m.company_id = p_company and m.user_id = auth.uid()
      and (m.role = 'owner' or (m.role = 'manager' and m.facility_ids is null))
  )
$$;

create function public.is_member(p_company uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.memberships where company_id = p_company and user_id = auth.uid())
$$;

-- True unless the map is in the trash. (Definer: employees cannot read maps rows.)
create function public.map_is_live(p_map uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.maps where id = p_map and deleted_at is null)
$$;

create function public.log_action(p_company uuid, p_action text, p_target text, p_details jsonb default '{}')
returns void
language sql security definer set search_path = public as $$
  insert into public.audit_log (company_id, actor, action, target, details)
  values (p_company, auth.uid(), p_action, p_target, coalesce(p_details, '{}'))
$$;
revoke execute on function public.log_action(uuid, text, text, jsonb) from public, anon, authenticated;

-- ------------------------------------------------------------ triggers

-- Maps: company always follows the facility; revision and audit fields are
-- maintained here so a client cannot forge them.
create function public.maps_before_write()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  select company_id into new.company_id from public.facilities where id = new.facility_id;
  if new.company_id is null then
    raise exception 'Facility not found' using errcode = 'foreign_key_violation';
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  if tg_op = 'INSERT' then
    new.revision := 1;
    new.created_at := now();
  else
    new.created_at := old.created_at;
    if new.draft is distinct from old.draft or new.name is distinct from old.name then
      new.revision := old.revision + 1;
    else
      new.revision := old.revision;
    end if;
    if new.deleted_at is distinct from old.deleted_at then
      perform public.log_action(new.company_id, case when new.deleted_at is null then 'map.restored' else 'map.deleted' end,
        new.id::text, jsonb_build_object('name', new.name));
    end if;
    if new.is_public is distinct from old.is_public then
      perform public.log_action(new.company_id, case when new.is_public then 'map.made_public' else 'map.made_private' end,
        new.id::text, jsonb_build_object('name', new.name));
    end if;
  end if;
  return new;
end $$;

create trigger maps_before_write before insert or update on public.maps
for each row execute function public.maps_before_write();

-- Turn pending invitations into memberships when the invited person signs up.
create function public.claim_invitations_for(p_user uuid, p_email text)
returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  insert into public.memberships (company_id, user_id, role, facility_ids)
  select company_id, p_user, role, facility_ids from public.invitations where email = lower(p_email)
  on conflict (company_id, user_id) do nothing;
  get diagnostics n = row_count;
  delete from public.invitations where email = lower(p_email);
  return n;
end $$;
revoke execute on function public.claim_invitations_for(uuid, text) from public, anon, authenticated;

create function public.on_auth_user_created()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.claim_invitations_for(new.id, new.email);
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
for each row execute function public.on_auth_user_created();

-- --------------------------------------------------------------- policies

alter table public.companies enable row level security;
alter table public.facilities enable row level security;
alter table public.memberships enable row level security;
alter table public.invitations enable row level security;
alter table public.maps enable row level security;
alter table public.published_maps enable row level security;
alter table public.map_versions enable row level security;
alter table public.audit_log enable row level security;

create policy companies_read on public.companies for select to authenticated using (public.is_member(id));
create policy companies_rename on public.companies for update to authenticated
  using (public.can_manage_company(id)) with check (public.can_manage_company(id));

create policy facilities_read on public.facilities for select to authenticated using (public.can_view_facility_row(company_id, id));
create policy facilities_insert on public.facilities for insert to authenticated with check (public.can_manage_company(company_id));
create policy facilities_update on public.facilities for update to authenticated
  using (public.can_manage_company(company_id)) with check (public.can_manage_company(company_id));
create policy facilities_delete on public.facilities for delete to authenticated using (public.can_manage_company(company_id));

-- Members are changed only through add_member/remove_member.
create policy memberships_read on public.memberships for select to authenticated
  using (user_id = auth.uid() or public.can_manage_company(company_id));

create policy invitations_read on public.invitations for select to authenticated using (public.can_manage_company(company_id));

-- Drafts: only people who can edit the facility.
create policy maps_read on public.maps for select to authenticated using (public.can_edit_facility(facility_id));
create policy maps_insert on public.maps for insert to authenticated with check (public.can_edit_facility(facility_id));
create policy maps_update on public.maps for update to authenticated
  using (public.can_edit_facility(facility_id)) with check (public.can_edit_facility(facility_id));
-- Permanent deletion only from the trash.
create policy maps_purge on public.maps for delete to authenticated
  using (deleted_at is not null and public.can_edit_facility(facility_id));

-- Published maps: anyone with access to the facility, unless the map is in the trash.
create policy published_read on public.published_maps for select to authenticated
  using (
    public.can_view_facility(facility_id) and public.map_is_live(map_id)
  );

create policy versions_read on public.map_versions for select to authenticated
  using (exists (select 1 from public.maps m where m.id = map_id and public.can_edit_facility(m.facility_id)));
create policy versions_insert on public.map_versions for insert to authenticated
  with check (
    created_by = auth.uid()
    and exists (select 1 from public.maps m where m.id = map_id and public.can_edit_facility(m.facility_id))
  );

create policy audit_read on public.audit_log for select to authenticated using (public.can_manage_company(company_id));

-- Table privileges (RLS still applies on top of these).
grant select, update on public.companies to authenticated;
grant select, insert, update, delete on public.facilities to authenticated;
grant select on public.memberships, public.invitations, public.published_maps, public.audit_log to authenticated;
grant select, insert, update, delete on public.maps to authenticated;
grant select, insert on public.map_versions to authenticated;
revoke all on all tables in schema public from anon;

-- -------------------------------------------------------------- functions

-- New company with the caller as owner and a first facility.
create function public.create_company(p_name text, p_facility_name text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare c uuid;
begin
  if auth.uid() is null then raise exception 'Please sign in first.' using errcode = '42501'; end if;
  insert into public.companies (name, created_by) values (trim(p_name), auth.uid()) returning id into c;
  insert into public.memberships (company_id, user_id, role) values (c, auth.uid(), 'owner');
  insert into public.facilities (company_id, name) values (c, trim(p_facility_name));
  perform public.log_action(c, 'company.created', c::text, jsonb_build_object('name', p_name));
  return c;
end $$;

-- Grants access by email. Returns 'added' (existing account) or 'invited'.
-- Owners can grant any role. Managers can grant manager/employee roles, and only
-- within the facilities they themselves manage.
create function public.add_member(p_company uuid, p_email text, p_role public.member_role, p_facility_ids uuid[] default null)
returns text
language plpgsql security definer set search_path = public as $$
declare
  me public.memberships := public.my_membership(p_company);
  target uuid;
  v_email text := lower(trim(p_email));
begin
  if me is null or me.role = 'employee' then
    raise exception 'Only owners and managers can add people.' using errcode = '42501';
  end if;
  if p_role = 'owner' and me.role <> 'owner' then
    raise exception 'Only an owner can add another owner.' using errcode = '42501';
  end if;
  if me.facility_ids is not null and (p_facility_ids is null or not (p_facility_ids <@ me.facility_ids)) then
    raise exception 'You can only give access to facilities you manage.' using errcode = '42501';
  end if;
  if p_facility_ids is not null and exists (
    select 1 from unnest(p_facility_ids) fid where not exists (select 1 from public.facilities f where f.id = fid and f.company_id = p_company)
  ) then
    raise exception 'One of those facilities is not part of this company.' using errcode = '22023';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'That doesn''t look like an email address.' using errcode = '22023';
  end if;

  select id into target from auth.users where lower(auth.users.email) = v_email;
  if target is not null then
    if exists (select 1 from public.memberships where company_id = p_company and user_id = target and role = 'owner') and me.role <> 'owner' then
      raise exception 'Only an owner can change another owner''s access.' using errcode = '42501';
    end if;
    insert into public.memberships (company_id, user_id, role, facility_ids)
    values (p_company, target, p_role, p_facility_ids)
    on conflict (company_id, user_id) do update set role = excluded.role, facility_ids = excluded.facility_ids;
    perform public.log_action(p_company, 'member.added', v_email, jsonb_build_object('role', p_role, 'facility_ids', p_facility_ids));
    return 'added';
  end if;
  insert into public.invitations (company_id, email, role, facility_ids, invited_by)
  values (p_company, v_email, p_role, p_facility_ids, auth.uid())
  on conflict (company_id, email) do update set role = excluded.role, facility_ids = excluded.facility_ids, invited_by = excluded.invited_by;
  perform public.log_action(p_company, 'member.invited', v_email, jsonb_build_object('role', p_role, 'facility_ids', p_facility_ids));
  return 'invited';
end $$;

-- Revokes access. Takes effect immediately because every policy checks memberships.
create function public.remove_member(p_company uuid, p_user uuid)
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
  delete from public.memberships where id = them.id;
  perform public.log_action(p_company, 'member.removed', (select email from auth.users where id = p_user),
    jsonb_build_object('role', them.role));
end $$;

create function public.cancel_invitation(p_company uuid, p_email text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.can_manage_company(p_company) then
    raise exception 'Only owners and managers can cancel invitations.' using errcode = '42501';
  end if;
  delete from public.invitations where company_id = p_company and email = lower(trim(p_email));
  perform public.log_action(p_company, 'member.invitation_cancelled', lower(trim(p_email)));
end $$;

-- People with access, with emails (which plain members cannot read from auth.users).
create function public.list_members(p_company uuid)
returns table (user_id uuid, email text, role public.member_role, facility_ids uuid[], pending boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from public.memberships m where m.company_id = p_company and m.user_id = auth.uid() and m.role <> 'employee') then
    raise exception 'Only owners and managers can see who has access.' using errcode = '42501';
  end if;
  return query
    select m.user_id, u.email::text, m.role, m.facility_ids, false
    from public.memberships m join auth.users u on u.id = m.user_id where m.company_id = p_company
    union all
    select null::uuid, i.email, i.role, i.facility_ids, true from public.invitations i where i.company_id = p_company
    order by 5, 2;
end $$;

-- Makes the current draft what employees see.
create function public.publish_map(p_map uuid)
returns timestamptz
language plpgsql security definer set search_path = public as $$
declare m public.maps; t timestamptz := now();
begin
  select * into m from public.maps where id = p_map;
  if m is null or not public.can_edit_facility(m.facility_id) then
    raise exception 'You don''t have permission to publish this map.' using errcode = '42501';
  end if;
  if m.deleted_at is not null then
    raise exception 'Restore this map from Recently deleted before publishing it.' using errcode = '22023';
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

-- Public link: returns the published map only if a manager made it public.
create function public.get_public_map(p_map uuid)
returns table (name text, doc jsonb, published_at timestamptz)
language sql stable security definer set search_path = public as $$
  select p.name, p.doc, p.published_at
  from public.published_maps p join public.maps m on m.id = p.map_id
  where p.map_id = p_map and m.is_public and m.deleted_at is null
$$;

-- Trash older than 30 days is removed permanently. Schedule daily (pg_cron) on Supabase.
create function public.purge_expired_trash()
returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  delete from public.maps where deleted_at < now() - interval '30 days';
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.purge_expired_trash() from public, anon, authenticated;

revoke execute on all functions in schema public from public, anon;
grant execute on function
  public.create_company(text, text),
  public.add_member(uuid, text, public.member_role, uuid[]),
  public.remove_member(uuid, uuid),
  public.cancel_invitation(uuid, text),
  public.list_members(uuid),
  public.publish_map(uuid),
  public.my_membership(uuid),
  public.can_view_facility(uuid),
  public.can_view_facility_row(uuid, uuid),
  public.can_edit_facility(uuid),
  public.can_manage_company(uuid),
  public.is_member(uuid),
  public.map_is_live(uuid)
to authenticated;
grant execute on function public.get_public_map(uuid) to anon, authenticated;

-- ------------------------------------------- sites: address, limits, join codes
-- Fits the white-label model: a company (tenant) has a contracted number of
-- sites; each site has an address and a 6-character join code that lets
-- employees add themselves to that one site as viewers. Join codes never grant
-- manager rights, so nobody can choose their own role.

alter table public.companies add column max_sites integer check (max_sites is null or max_sites >= 0);
alter table public.facilities add column address text check (address is null or char_length(address) <= 300);
alter table public.facilities add column join_code text unique check (join_code ~ '^[A-HJ-NP-Z2-9]{6}$');

-- Codes avoid look-alike characters (0/O, 1/I).
create function public.new_join_code()
returns text
language plpgsql volatile set search_path = public as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code text;
begin
  loop
    code := (select string_agg(substr(alphabet, 1 + (get_byte(gen_random_bytes(1), 0) % 32), 1), '') from generate_series(1, 6));
    exit when not exists (select 1 from public.facilities where join_code = code);
  end loop;
  return code;
end $$;

create function public.facilities_before_insert()
returns trigger
language plpgsql security definer set search_path = public as $$
declare lim integer;
begin
  select max_sites into lim from public.companies where id = new.company_id;
  if lim is not null and (select count(*) from public.facilities where company_id = new.company_id) >= lim then
    raise exception 'Your plan includes % site(s). Contact us to add another site.', lim using errcode = '23514';
  end if;
  new.join_code := public.new_join_code();
  return new;
end $$;

create trigger facilities_before_insert before insert on public.facilities
for each row execute function public.facilities_before_insert();

-- Contract limits are set by Bergeron Maps staff (service role), not by customers.
create function public.facilities_protect_columns()
returns trigger
language plpgsql set search_path = public as $$
begin
  if new.join_code is distinct from old.join_code and current_setting('bm.allow_code_change', true) is distinct from 'on' then
    raise exception 'Use “New join code” to change a site code.' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger facilities_protect_columns before update on public.facilities
for each row execute function public.facilities_protect_columns();

revoke update on public.companies from authenticated;
grant update (name) on public.companies to authenticated;

-- Site managers can see and rotate their site's code; employees cannot read codes.
create function public.get_join_code(p_facility uuid)
returns text
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.can_edit_facility(p_facility) then
    raise exception 'Only managers of this site can see its join code.' using errcode = '42501';
  end if;
  return (select join_code from public.facilities where id = p_facility);
end $$;

create function public.rotate_join_code(p_facility uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare code text; c uuid;
begin
  if not public.can_edit_facility(p_facility) then
    raise exception 'Only managers of this site can change its join code.' using errcode = '42501';
  end if;
  perform set_config('bm.allow_code_change', 'on', true);
  update public.facilities set join_code = public.new_join_code() where id = p_facility returning join_code, company_id into code, c;
  perform set_config('bm.allow_code_change', 'off', true);
  perform public.log_action(c, 'site.join_code_changed', p_facility::text);
  return code;
end $$;

-- Employee enters a code: they become a viewer of that one site.
-- Existing broader access is never reduced, and roles are never raised.
create function public.join_site(p_code text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare f public.facilities; m public.memberships;
begin
  if auth.uid() is null then raise exception 'Please sign in first.' using errcode = '42501'; end if;
  select * into f from public.facilities where join_code = upper(replace(trim(p_code), ' ', ''));
  if f is null then
    raise exception 'That code didn''t match a site. Check it with your manager and try again.' using errcode = '22023';
  end if;
  select * into m from public.memberships where company_id = f.company_id and user_id = auth.uid();
  if m is null then
    insert into public.memberships (company_id, user_id, role, facility_ids) values (f.company_id, auth.uid(), 'employee', array[f.id]);
  elsif m.facility_ids is not null and not (f.id = any (m.facility_ids)) then
    update public.memberships set facility_ids = facility_ids || f.id where id = m.id;
  end if;
  perform public.log_action(f.company_id, 'site.joined_with_code', f.id::text);
  return f.id;
end $$;

revoke execute on function public.new_join_code() from public, anon, authenticated;
grant execute on function public.get_join_code(uuid), public.rotate_join_code(uuid), public.join_site(text) to authenticated;
