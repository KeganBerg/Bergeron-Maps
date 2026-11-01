-- Security fixes from the app audit (2026-11-01):
-- (a) site managers can't change anyone whose access reaches beyond their own sites
-- (b) join codes can't be guessed: 10 wrong codes per person per hour
-- (c) site managers only see the people at their own sites
-- (d) map documents have a size limit (same 25 MB as a map file)

-- (a) + unchanged rules from before
create or replace function public.add_member(p_company uuid, p_email text, p_role public.member_role, p_facility_ids uuid[] default null)
returns text
language plpgsql security definer set search_path = public as $$
declare
  me public.memberships := public.my_membership(p_company);
  target uuid;
  existing public.memberships;
  pending public.invitations;
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
    select * into existing from public.memberships where company_id = p_company and user_id = target;
    if existing.id is not null and existing.role = 'owner' and me.role <> 'owner' then
      raise exception 'Only an owner can change another owner''s access.' using errcode = '42501';
    end if;
    -- A site manager may only change people whose current access is within their own sites.
    if existing.id is not null and me.facility_ids is not null
       and (existing.facility_ids is null or not (existing.facility_ids <@ me.facility_ids)) then
      raise exception 'This person has access beyond your sites. Ask an owner or regional manager to change it.' using errcode = '42501';
    end if;
    insert into public.memberships (company_id, user_id, role, facility_ids)
    values (p_company, target, p_role, p_facility_ids)
    on conflict (company_id, user_id) do update set role = excluded.role, facility_ids = excluded.facility_ids;
    perform public.log_action(p_company, 'member.added', v_email, jsonb_build_object('role', p_role, 'facility_ids', p_facility_ids));
    return 'added';
  end if;

  select * into pending from public.invitations where company_id = p_company and email = v_email;
  if pending.id is not null and me.facility_ids is not null
     and (pending.role = 'owner' or pending.facility_ids is null or not (pending.facility_ids <@ me.facility_ids)) then
    raise exception 'This person was invited with access beyond your sites. Ask an owner or regional manager to change it.' using errcode = '42501';
  end if;
  insert into public.invitations (company_id, email, role, facility_ids, invited_by)
  values (p_company, v_email, p_role, p_facility_ids, auth.uid())
  on conflict (company_id, email) do update set role = excluded.role, facility_ids = excluded.facility_ids, invited_by = excluded.invited_by;
  perform public.log_action(p_company, 'member.invited', v_email, jsonb_build_object('role', p_role, 'facility_ids', p_facility_ids));
  return 'invited';
end $$;

-- Site managers can only cancel invitations within their own sites.
create or replace function public.cancel_invitation(p_company uuid, p_email text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  me public.memberships := public.my_membership(p_company);
  inv public.invitations;
begin
  if me is null or me.role = 'employee' then
    raise exception 'Only owners and managers can cancel invitations.' using errcode = '42501';
  end if;
  select * into inv from public.invitations where company_id = p_company and email = lower(trim(p_email));
  if inv.id is null then return; end if;
  if me.facility_ids is not null and (inv.role = 'owner' or inv.facility_ids is null or not (inv.facility_ids <@ me.facility_ids)) then
    raise exception 'You can only cancel invitations for your own sites.' using errcode = '42501';
  end if;
  delete from public.invitations where id = inv.id;
  perform public.log_action(p_company, 'member.invitation_cancelled', inv.email);
end $$;

-- (b) Wrong join codes are counted per person; after 10 in an hour, joining pauses.
create table public.join_attempts (
  user_id uuid not null references auth.users (id) on delete cascade,
  at timestamptz not null default now()
);
create index on public.join_attempts (user_id, at desc);
alter table public.join_attempts enable row level security;
revoke all on public.join_attempts from anon, authenticated;

-- Returns the site id, or null when the code doesn't match (so the failed try is recorded).
create or replace function public.join_site(p_code text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare f public.facilities; m public.memberships;
begin
  if auth.uid() is null then raise exception 'Please sign in first.' using errcode = '42501'; end if;
  if (select count(*) from public.join_attempts where user_id = auth.uid() and at > now() - interval '1 hour') >= 10 then
    raise exception 'Too many wrong codes. Wait an hour, or ask your manager to add your email instead.' using errcode = '54000';
  end if;
  select * into f from public.facilities where join_code = upper(replace(trim(coalesce(p_code, '')), ' ', ''));
  if f.id is null then
    insert into public.join_attempts (user_id) values (auth.uid());
    delete from public.join_attempts where at < now() - interval '1 day';
    return null;
  end if;
  select * into m from public.memberships where company_id = f.company_id and user_id = auth.uid();
  if m.id is null then
    insert into public.memberships (company_id, user_id, role, facility_ids) values (f.company_id, auth.uid(), 'employee', array[f.id]);
  elsif m.facility_ids is not null and not (f.id = any (m.facility_ids)) then
    update public.memberships set facility_ids = facility_ids || f.id where id = m.id;
  end if;
  perform public.log_action(f.company_id, 'site.joined_with_code', f.id::text);
  return f.id;
end $$;

-- (c) Site managers see only the people at their own sites (and themselves).
create or replace function public.list_members(p_company uuid)
returns table (user_id uuid, email text, role public.member_role, facility_ids uuid[], pending boolean)
language plpgsql stable security definer set search_path = public as $$
declare me public.memberships := public.my_membership(p_company);
begin
  if me is null or me.role = 'employee' then
    raise exception 'Only owners and managers can see who has access.' using errcode = '42501';
  end if;
  return query
    select m.user_id, u.email::text, m.role, m.facility_ids, false
    from public.memberships m join auth.users u on u.id = m.user_id
    where m.company_id = p_company
      and (me.facility_ids is null or m.user_id = auth.uid() or (m.facility_ids is not null and m.facility_ids && me.facility_ids))
    union all
    select null::uuid, i.email, i.role, i.facility_ids, true from public.invitations i
    where i.company_id = p_company
      and (me.facility_ids is null or (i.facility_ids is not null and i.facility_ids && me.facility_ids))
    order by 5, 2;
end $$;

-- (d) Size limits, matching the 25 MB map file limit.
alter table public.maps add constraint maps_draft_size check (octet_length(draft::text) <= 26214400);
alter table public.map_versions add constraint map_versions_doc_size check (octet_length(doc::text) <= 26214400);
alter table public.published_maps add constraint published_maps_doc_size check (octet_length(doc::text) <= 26214400);
