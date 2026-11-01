-- Custom site links: …/#/harbor-hotel instead of …/#/site/<uuid>.
-- A slug only names a site; opening it still requires signing in with an
-- email that was given access to that site.

alter table public.facilities add column slug text unique
  check (slug ~ '^[a-z0-9]([a-z0-9-]{0,48}[a-z0-9])?$' and slug not in ('edit', 'view', 'team', 'site', 'admin', 'login'));

create function public.slugify(p text)
returns text
language sql immutable set search_path = public as $$
  select coalesce(nullif(left(trim(both '-' from regexp_replace(lower(coalesce(p, '')), '[^a-z0-9]+', '-', 'g')), 50), ''), 'site')
$$;

-- First free slug based on the name: harbor-hotel, harbor-hotel-2, …
create function public.unique_slug(p_name text, p_except uuid default null)
returns text
language plpgsql security definer set search_path = public as $$
declare base text := trim(both '-' from left(public.slugify(p_name), 46)); s text; n int := 1;
begin
  if base in ('edit', 'view', 'team', 'site', 'admin', 'login') then base := base || '-site'; end if;
  s := base;
  while exists (select 1 from public.facilities where slug = s and id is distinct from p_except) loop
    n := n + 1;
    s := base || '-' || n;
  end loop;
  return s;
end $$;
revoke execute on function public.unique_slug(text, uuid) from public, anon, authenticated;

update public.facilities set slug = public.unique_slug(name, id) where slug is null;
alter table public.facilities alter column slug set not null;

create function public.facilities_default_slug()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.slug is null or new.slug = '' then
    new.slug := public.unique_slug(new.name);
  else
    new.slug := public.slugify(new.slug);
  end if;
  return new;
end $$;
create trigger facilities_default_slug before insert or update of slug on public.facilities
for each row execute function public.facilities_default_slug();

grant select (slug) on public.facilities to authenticated;
-- Owners and regional managers can rename a site's link (facilities_update policy).

-- Links are resolved with a normal select on facilities, so row-level security
-- decides: a slug for a site you can't see returns nothing, revealing nothing.
