-- Security fixes from the third app audit (2026-11-10):
-- (a) A site manager could type an employee join code for another site and
--     become a MANAGER of that site too (join codes added the site to their
--     existing manager access). Join codes now only extend employee access.
-- (b) The last owner could demote themselves with add_member, leaving a
--     company with no owner. remove_member already refused this.
-- (c) Moving a live map to another site left its published copy filed under
--     the old site, so the old site's employees kept seeing it and the new
--     site's employees didn't.
-- (d) Supabase grants every new table and function to anon and authenticated
--     by default. Row-level security still blocked writes, but the grants
--     are now trimmed so that a future policy mistake can't open them:
--     read-only tables keep only SELECT, site rows can only change name,
--     address and link, and visitors who aren't signed in can call nothing
--     except the public map link.
-- (e) block_password_sign_in: the app signs in only with emailed links. This
--     access token hook refuses password sessions, so nobody can pre-register
--     someone else's email with a password and use it later. It does nothing
--     until it is switched on in Authentication > Hooks (Custom Access Token).

-- (a)
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

-- (b) Same rules as 20261101030000, plus the last-owner check.
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
    if existing.id is not null and existing.role = 'owner' and p_role <> 'owner'
       and (select count(*) from public.memberships where company_id = p_company and role = 'owner') = 1 then
      raise exception 'A company needs at least one owner. Add another owner first.' using errcode = '42501';
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

-- (c) The published copy follows its map to the new site.
create or replace function public.maps_after_move()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.published_maps set facility_id = new.facility_id, company_id = new.company_id
  where map_id = new.id and (facility_id is distinct from new.facility_id or company_id is distinct from new.company_id);
  return null;
end $$;
drop trigger if exists maps_after_move on public.maps;
create trigger maps_after_move after update of facility_id on public.maps
for each row execute function public.maps_after_move();

-- Maps already moved before this fix.
update public.published_maps p set facility_id = m.facility_id, company_id = m.company_id
from public.maps m
where m.id = p.map_id and (p.facility_id is distinct from m.facility_id or p.company_id is distinct from m.company_id);

-- (d) Table privileges: only what the app uses. Row-level security still applies on top.
revoke insert, update, delete, truncate, references, trigger on
  public.companies, public.memberships, public.invitations, public.published_maps, public.audit_log, public.map_versions
from authenticated;
revoke truncate, references, trigger on public.facilities, public.maps from authenticated;
grant update (name) on public.companies to authenticated;
grant insert on public.map_versions to authenticated;
-- Site rows: name, address and link may change; company, id and join code may not
-- (rotate_join_code changes codes as the database owner).
revoke update on public.facilities from authenticated;
grant update (name, address, slug) on public.facilities to authenticated;

-- Functions: nothing for visitors who aren't signed in except the public map link.
revoke execute on function public.get_join_code(uuid), public.rotate_join_code(uuid), public.join_site(text), public.slugify(text)
  from public, anon;
grant execute on function public.get_join_code(uuid), public.rotate_join_code(uuid), public.join_site(text) to authenticated;
revoke execute on function public.maps_after_move() from public, anon, authenticated;
-- Functions added from now on start private too; each migration grants what it needs.
alter default privileges in schema public revoke execute on functions from public, anon;

-- (e) Custom Access Token hook. Returns an error for sessions that began with a
-- password, and the event unchanged for everything else (email links).
create or replace function public.block_password_sign_in(event jsonb)
returns jsonb
language plpgsql stable set search_path = public as $$
begin
  if exists (
    select 1 from jsonb_array_elements(coalesce(event -> 'claims' -> 'amr', '[]'::jsonb)) a
    where a ->> 'method' = 'password'
  ) then
    return jsonb_build_object('error', jsonb_build_object(
      'http_code', 403, 'message', 'Sign in with the link we email you. Passwords are not used.'));
  end if;
  return event;
end $$;
revoke execute on function public.block_password_sign_in(jsonb) from public, anon, authenticated;
grant usage on schema public to supabase_auth_admin;
grant execute on function public.block_password_sign_in(jsonb) to supabase_auth_admin;
