-- Only Bergeron Maps admins create companies. Each admin creates a company,
-- adds its sites, and gives managers access to their own sites by email.
-- A site link by itself grants nothing: the person must sign in with an email
-- that an admin or manager added to that site.

create table public.platform_admins (
  email text primary key check (email = lower(email) and position('@' in email) > 1),
  created_at timestamptz not null default now()
);
alter table public.platform_admins enable row level security;
-- No policies and no grants: only the service role and SQL editor can change admins.
revoke all on public.platform_admins from anon, authenticated;

create function public.is_platform_admin()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.platform_admins pa join auth.users u on lower(u.email) = pa.email
    where u.id = auth.uid()
  )
$$;
revoke execute on function public.is_platform_admin() from public, anon;
grant execute on function public.is_platform_admin() to authenticated;

create or replace function public.create_company(p_name text, p_facility_name text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare c uuid;
begin
  if auth.uid() is null then raise exception 'Please sign in first.' using errcode = '42501'; end if;
  if not public.is_platform_admin() then
    raise exception 'Only Bergeron Maps admins can set up a new company.' using errcode = '42501';
  end if;
  insert into public.companies (name, created_by) values (trim(p_name), auth.uid()) returning id into c;
  insert into public.memberships (company_id, user_id, role) values (c, auth.uid(), 'owner');
  insert into public.facilities (company_id, name) values (c, trim(p_facility_name));
  perform public.log_action(c, 'company.created', c::text, jsonb_build_object('name', p_name));
  return c;
end $$;

-- Join codes are only readable through get_join_code (managers of the site),
-- not by selecting the facilities table.
revoke select on public.facilities from authenticated;
grant select (id, company_id, name, address, created_at) on public.facilities to authenticated;
