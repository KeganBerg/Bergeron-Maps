-- Fourth access audit (2026-11-19): accounts, roles and sharing.
--
-- (a) A Bergeron Maps admin who also had their own membership in a company
--     (joined a site with its code, or was added as an employee) lost their
--     admin rights there: Sites & people refused to list people, and adding
--     or removing anyone failed with "Only owners and managers can ...".
--     Admins now always act as an owner, whatever membership they also have,
--     and typing a site code as an admin explains that they already have
--     every site instead of quietly making them an employee.
-- (b) A site manager couldn't remove an employee who also works at another
--     site ("You can only remove employees at facilities you manage"), so
--     someone who left could keep seeing that site's maps. Removing them now
--     takes away only the sites that manager runs; the employee keeps their
--     other sites, and is removed completely when nothing is left. The same
--     applies to cancelling an invitation.
-- (c) "locations" is now a reserved site link name, like "team" and "admin":
--     …/#/locations is the My Locations page, so a site with that link could
--     never be opened by it. A site that already has it gets "locations-site".
-- (d) Leaving a site you aren't at no longer writes "left the site" to the
--     company's activity log.
--
-- Unchanged: who can see or change what. Each function below keeps every
-- other rule it had (see 20261031000000, 20261101030000, 20261112010000).

-- ------------------------------------------------------------------ (a)

create or replace function public.my_membership(p_company uuid)
returns public.memberships
language plpgsql stable security definer set search_path = public as $$
declare r public.memberships;
begin
  select * into r from public.memberships where company_id = p_company and user_id = auth.uid();
  -- Admins manage every company as its owner, even one they also belong to with a smaller role.
  if public.is_platform_admin() and exists (select 1 from public.companies where id = p_company) then
    if r.id is null then
      r.company_id := p_company;
      r.user_id := auth.uid();
    end if;
    r.role := 'owner';
    r.facility_ids := null;
    return r;
  end if;
  if r.id is not null then return r; end if;
  return null;
end $$;

create or replace function public.join_site(p_code text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare f public.facilities; m public.memberships;
begin
  if auth.uid() is null then raise exception 'Please sign in first.' using errcode = '42501'; end if;
  -- One code check at a time per person, so parallel requests can't slip past the limit.
  perform pg_advisory_xact_lock(hashtextextended('join_site:' || auth.uid()::text, 0));
  if (select count(*) from public.join_attempts where user_id = auth.uid() and at > now() - interval '1 hour') >= 10 then
    raise exception 'Too many wrong codes. Wait an hour, or ask your manager to add your email instead.' using errcode = '54000';
  end if;
  select * into f from public.facilities where join_code = upper(replace(trim(coalesce(p_code, '')), ' ', ''));
  if f.id is null then
    insert into public.join_attempts (user_id) values (auth.uid());
    delete from public.join_attempts where at < now() - interval '1 day';
    return null;
  end if;
  if public.is_platform_admin() then
    raise exception 'You’re signed in as a Bergeron Maps admin, so you already have every site. To see what an employee sees, sign in with a different email.'
      using errcode = '22023';
  end if;
  select * into m from public.memberships where company_id = f.company_id and user_id = auth.uid();
  if m.id is null then
    insert into public.memberships (company_id, user_id, role, facility_ids) values (f.company_id, auth.uid(), 'employee', array[f.id]);
  elsif m.facility_ids is not null and not (f.id = any (m.facility_ids)) then
    -- A membership has one role for all its sites, so adding a site here would
    -- make a site manager a manager of this site too.
    if m.role <> 'employee' then
      raise exception 'You already manage other sites in this company. Ask an owner or regional manager to add this site to your access.'
        using errcode = '42501';
    end if;
    update public.memberships set facility_ids = facility_ids || f.id where id = m.id;
  end if;
  perform public.log_action(f.company_id, 'site.joined_with_code', f.id::text);
  return f.id;
end $$;

-- ------------------------------------------------------------------ (b)

create or replace function public.remove_member(p_company uuid, p_user uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  me public.memberships := public.my_membership(p_company);
  them public.memberships;
  keep uuid[];
begin
  select * into them from public.memberships where company_id = p_company and user_id = p_user;
  if them is null then return; end if;
  if me is null or me.role = 'employee' then
    raise exception 'Only owners and managers can remove people.' using errcode = '42501';
  end if;
  if them.role = 'owner' and me.role <> 'owner' then
    raise exception 'Only an owner can remove an owner.' using errcode = '42501';
  end if;
  if me.facility_ids is not null then
    -- Site managers remove employees from the sites they run, and only from those.
    if them.role <> 'employee' or them.facility_ids is null or not (them.facility_ids && me.facility_ids) then
      raise exception 'You can only remove employees at sites you manage.' using errcode = '42501';
    end if;
    keep := array(select x from unnest(them.facility_ids) x where not (x = any (me.facility_ids)));
    if cardinality(keep) > 0 then
      update public.memberships set facility_ids = keep where id = them.id;
      update public.manager_requests set status = 'denied', decided_by = auth.uid(), decided_at = now()
      where company_id = p_company and user_id = p_user and status = 'pending' and facility_id = any (me.facility_ids);
      perform public.log_action(p_company, 'member.removed_from_sites', (select email from auth.users where id = p_user),
        jsonb_build_object('role', them.role, 'facility_ids', array(select x from unnest(them.facility_ids) x where x = any (me.facility_ids))));
      return;
    end if;
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

create or replace function public.cancel_invitation(p_company uuid, p_email text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  me public.memberships := public.my_membership(p_company);
  inv public.invitations;
  keep uuid[];
begin
  if me is null or me.role = 'employee' then
    raise exception 'Only owners and managers can cancel invitations.' using errcode = '42501';
  end if;
  select * into inv from public.invitations where company_id = p_company and email = lower(trim(p_email));
  if inv.id is null then return; end if;
  if me.facility_ids is not null then
    if inv.role <> 'employee' or inv.facility_ids is null or not (inv.facility_ids && me.facility_ids) then
      raise exception 'You can only cancel invitations for your own sites.' using errcode = '42501';
    end if;
    keep := array(select x from unnest(inv.facility_ids) x where not (x = any (me.facility_ids)));
    if cardinality(keep) > 0 then
      update public.invitations set facility_ids = keep where id = inv.id;
      perform public.log_action(p_company, 'member.invitation_narrowed', inv.email);
      return;
    end if;
  end if;
  delete from public.invitations where id = inv.id;
  perform public.log_action(p_company, 'member.invitation_cancelled', inv.email);
end $$;

-- ------------------------------------------------------------------ (c)

create or replace function public.unique_slug(p_name text, p_except uuid default null)
returns text
language plpgsql security definer set search_path = public as $$
declare base text := trim(both '-' from left(public.slugify(p_name), 46)); s text; n int := 1;
begin
  if base in ('edit', 'view', 'team', 'site', 'admin', 'login', 'locations') then base := base || '-site'; end if;
  s := base;
  while exists (select 1 from public.facilities where slug = s and id is distinct from p_except) loop
    n := n + 1;
    s := base || '-' || n;
  end loop;
  return s;
end $$;
revoke execute on function public.unique_slug(text, uuid) from public, anon, authenticated;

update public.facilities set slug = public.unique_slug(slug, id) where slug = 'locations';
alter table public.facilities drop constraint if exists facilities_slug_check;
alter table public.facilities add constraint facilities_slug_check
  check (slug ~ '^[a-z0-9]([a-z0-9-]{0,48}[a-z0-9])?$' and slug not in ('edit', 'view', 'team', 'site', 'admin', 'login', 'locations'));

-- ------------------------------------------------------------------ (d)

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
  if not (p_facility = any (m.facility_ids)) then return; end if;
  if array_length(array_remove(m.facility_ids, p_facility), 1) is null then
    delete from public.memberships where id = m.id;
  else
    update public.memberships set facility_ids = array_remove(facility_ids, p_facility) where id = m.id;
  end if;
  update public.manager_requests set status = 'denied', decided_at = now()
  where user_id = auth.uid() and facility_id = p_facility and status = 'pending';
  perform public.log_action(c, 'site.left', p_facility::text);
end $$;

-- ---------------------------------------------------------- privileges
-- Replacing a function keeps its grants; restated so this file stands on its own.
revoke execute on function public.my_membership(uuid), public.join_site(text), public.remove_member(uuid, uuid),
  public.cancel_invitation(uuid, text), public.leave_site(uuid) from public, anon;
grant execute on function public.my_membership(uuid), public.join_site(text), public.remove_member(uuid, uuid),
  public.cancel_invitation(uuid, text), public.leave_site(uuid) to authenticated;
