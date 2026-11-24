-- Paid accounts: the website's Stripe Checkout opens a company by itself, and a company whose
-- payment fails (or whose 10-day grace period runs out) is paused until it pays.
--
-- Only the Cloudflare Worker calls these functions, with the service role key, after checking
-- Stripe's signed webhook. Customers and admins can't call them.
--
-- Pausing moves the company's memberships and open invitations aside into paused_* tables.
-- Every access rule already reads public.memberships, so a paused company's people lose access
-- everywhere at once without changing each policy, and resuming moves them back unchanged.
-- Platform admins keep access throughout (my_membership treats them as owners).

alter table public.companies
  add column if not exists stripe_customer_id text unique,
  add column if not exists stripe_subscription_id text,
  add column if not exists contract_term_months integer check (contract_term_months is null or contract_term_months in (6, 12)),
  add column if not exists paused_at timestamptz;

create table if not exists public.paused_memberships (like public.memberships including all);
create index if not exists paused_memberships_user on public.paused_memberships (user_id);

create table if not exists public.paused_invitations (like public.invitations including all);

-- "like" copies columns, keys and indexes but not foreign keys. Added only once, so running this
-- file again is harmless.
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'paused_memberships_company_fkey') then
    alter table public.paused_memberships
      add constraint paused_memberships_company_fkey foreign key (company_id) references public.companies (id) on delete cascade,
      add constraint paused_memberships_user_fkey foreign key (user_id) references auth.users (id) on delete cascade;
    alter table public.paused_invitations
      add constraint paused_invitations_company_fkey foreign key (company_id) references public.companies (id) on delete cascade;
  end if;
end $$;

alter table public.paused_memberships enable row level security;
alter table public.paused_invitations enable row level security;
revoke all on public.paused_memberships, public.paused_invitations from anon, authenticated;

-- Opens the account for a paid order. Safe to call twice for the same Stripe customer: the
-- second call answers the existing company. The buyer becomes the owner (invited if they have
-- never signed in), with one first site to rename and room for as many sites as they bought.
create or replace function public.provision_paid_account(p_customer text, p_subscription text, p_company text,
  p_email text, p_locations integer, p_term integer default null)
returns table (company_id uuid, created boolean)
language plpgsql security definer set search_path = public as $$
declare c uuid; owner_id uuid; v_email text := lower(trim(p_email));
begin
  if coalesce(trim(p_customer), '') = '' then raise exception 'Stripe customer is missing.' using errcode = '22023'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Owner email is not valid.' using errcode = '22023'; end if;
  if p_locations is null or p_locations < 1 then raise exception 'At least 1 location.' using errcode = '22023'; end if;
  select id into c from public.companies where stripe_customer_id = p_customer;
  if c is not null then
    return query select c, false;
    return;
  end if;
  insert into public.companies (name, max_sites, stripe_customer_id, stripe_subscription_id, contract_term_months)
  values (left(trim(p_company), 120), p_locations, p_customer, nullif(p_subscription, ''), p_term)
  returning id into c;
  insert into public.facilities (company_id, name) values (c, 'First location');
  select id into owner_id from auth.users where lower(email) = v_email;
  if owner_id is not null then
    insert into public.memberships (company_id, user_id, role) values (c, owner_id, 'owner');
  else
    insert into public.invitations (company_id, email, role) values (c, v_email, 'owner');
  end if;
  perform public.log_action(c, 'company.created', c::text,
    jsonb_build_object('source', 'stripe', 'locations', p_locations, 'term_months', p_term));
  return query select c, true;
end $$;

-- Pauses (p_paused = true) or resumes a company by its Stripe customer. Answers the company
-- id, or null when no company belongs to that customer. Repeating either is harmless.
create or replace function public.set_account_paused(p_customer text, p_paused boolean)
returns uuid
language plpgsql security definer set search_path = public as $$
declare co public.companies; gone uuid;
begin
  select * into co from public.companies where stripe_customer_id = p_customer;
  if co.id is null then return null; end if;
  if p_paused and co.paused_at is null then
    insert into public.paused_memberships select * from public.memberships where company_id = co.id on conflict do nothing;
    insert into public.paused_invitations select * from public.invitations where company_id = co.id on conflict do nothing;
    delete from public.invitations where company_id = co.id;
    for gone in delete from public.memberships where company_id = co.id returning user_id loop
      perform public.end_sessions(gone);
    end loop;
    update public.companies set paused_at = now() where id = co.id;
    perform public.log_action(co.id, 'company.paused', co.id::text, '{}');
  elsif not p_paused and co.paused_at is not null then
    -- Anyone an admin added during the pause keeps that newer access.
    insert into public.memberships select * from public.paused_memberships where company_id = co.id on conflict do nothing;
    insert into public.invitations select * from public.paused_invitations where company_id = co.id on conflict do nothing;
    delete from public.paused_memberships where company_id = co.id;
    delete from public.paused_invitations where company_id = co.id;
    update public.companies set paused_at = null where id = co.id;
    perform public.log_action(co.id, 'company.resumed', co.id::text, '{}');
  end if;
  return co.id;
end $$;

revoke execute on function public.provision_paid_account(text, text, text, text, integer, integer),
  public.set_account_paused(text, boolean) from public, anon, authenticated;
grant execute on function public.provision_paid_account(text, text, text, text, integer, integer),
  public.set_account_paused(text, boolean) to service_role;

-- The companies a signed-in person belongs to that are paused, so the app can say why their
-- maps are gone instead of showing an empty account.
create or replace function public.my_paused_accounts()
returns table (company_name text)
language sql stable security definer set search_path = public as $$
  select c.name from public.companies c
  where c.paused_at is not null and (
    exists (select 1 from public.paused_memberships m where m.company_id = c.id and m.user_id = auth.uid())
    or exists (select 1 from public.paused_invitations i join auth.users u on lower(u.email) = i.email
               where i.company_id = c.id and u.id = auth.uid()))
  order by c.name
$$;
revoke execute on function public.my_paused_accounts() from public, anon;
grant execute on function public.my_paused_accounts() to authenticated;

-- Public links stop showing a paused company's maps.
create or replace function public.get_public_site(p_slug text)
returns table (site_name text, map_id uuid, name text, doc jsonb, published_at timestamptz)
language sql stable security definer set search_path = public as $$
  select f.name, p.map_id, p.name, p.doc, p.published_at
  from public.facilities f
  join public.companies c on c.id = f.company_id
  join public.published_maps p on p.facility_id = f.id
  join public.maps m on m.id = p.map_id
  where f.slug = lower(trim(p_slug)) and m.is_public and m.deleted_at is null and c.paused_at is null
  order by p.name
$$;

create or replace function public.get_public_map(p_map uuid)
returns table (name text, doc jsonb, published_at timestamptz)
language sql stable security definer set search_path = public as $$
  select p.name, p.doc, p.published_at
  from public.published_maps p
  join public.maps m on m.id = p.map_id
  join public.companies c on c.id = m.company_id
  where p.map_id = p_map and m.is_public and m.deleted_at is null and c.paused_at is null
$$;
grant execute on function public.get_public_site(text), public.get_public_map(uuid) to anon, authenticated;
