-- Audit fixes (2026-11-06):
-- (a) Admin rights need a confirmed email. Admins are matched by email, so an
--     account made with an admin's address but never confirmed must not count.
-- (b) The 10-wrong-codes-per-hour limit holds even when many guesses are sent
--     at the same moment (they now wait their turn per person).

create or replace function public.is_platform_admin()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.platform_admins pa join auth.users u on lower(u.email) = pa.email
    where u.id = auth.uid() and u.email_confirmed_at is not null
  )
$$;

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
    update public.memberships set facility_ids = facility_ids || f.id where id = m.id;
  end if;
  perform public.log_action(f.company_id, 'site.joined_with_code', f.id::text);
  return f.id;
end $$;
