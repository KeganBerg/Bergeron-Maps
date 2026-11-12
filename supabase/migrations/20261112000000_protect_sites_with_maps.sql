-- A site that still has maps (including ones in Recently deleted) can't be
-- deleted. Deleting a site removes its maps and their history for good,
-- skipping the trash, so the maps have to be deleted or moved first.
-- Deleting a whole company (Bergeron Maps staff) still works.

create or replace function public.facilities_protect_maps()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- When the company itself is being deleted, its sites go with it.
  if not exists (select 1 from public.companies where id = old.company_id) then
    return old;
  end if;
  if exists (select 1 from public.maps where facility_id = old.id) then
    raise exception 'This site still has maps. Delete or move its maps first (including any in Recently deleted).'
      using errcode = '23503';
  end if;
  return old;
end $$;

drop trigger if exists facilities_protect_maps on public.facilities;
create trigger facilities_protect_maps before delete on public.facilities
for each row execute function public.facilities_protect_maps();
