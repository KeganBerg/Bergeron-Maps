-- Map lists without downloading whole maps.
--
-- The maps page shows each map's floor and space counts. Until now the app
-- downloaded every map's full drawing (often megabytes) just to count them.
-- These are PostgREST "computed columns": the app asks for floor_count and
-- space_count next to the other columns, and the database counts them, so
-- only the numbers travel. They read the row they are given (the caller's
-- row-level security already decided which rows those are) and change nothing.

-- Floors that aren't the inside of a building (what the maps page calls floors).
create or replace function public.floor_count(m public.maps) returns integer
language sql stable set search_path = '' as $$
  select count(*)::integer
  from jsonb_array_elements(case when jsonb_typeof(m.draft -> 'floors') = 'array' then m.draft -> 'floors' else '[]'::jsonb end) f
  where nullif(f ->> 'interiorOf', '') is null
$$;

-- Parking spaces on every floor.
create or replace function public.space_count(m public.maps) returns integer
language sql stable set search_path = '' as $$
  select count(*)::integer
  from jsonb_array_elements(case when jsonb_typeof(m.draft -> 'floors') = 'array' then m.draft -> 'floors' else '[]'::jsonb end) f,
       jsonb_array_elements(case when jsonb_typeof(f -> 'objects') = 'array' then f -> 'objects' else '[]'::jsonb end) o
  where o ->> 'kind' = 'space'
$$;

-- The same counts for what employees see (the published copy).
create or replace function public.floor_count(p public.published_maps) returns integer
language sql stable set search_path = '' as $$
  select count(*)::integer
  from jsonb_array_elements(case when jsonb_typeof(p.doc -> 'floors') = 'array' then p.doc -> 'floors' else '[]'::jsonb end) f
  where nullif(f ->> 'interiorOf', '') is null
$$;

create or replace function public.space_count(p public.published_maps) returns integer
language sql stable set search_path = '' as $$
  select count(*)::integer
  from jsonb_array_elements(case when jsonb_typeof(p.doc -> 'floors') = 'array' then p.doc -> 'floors' else '[]'::jsonb end) f,
       jsonb_array_elements(case when jsonb_typeof(f -> 'objects') = 'array' then f -> 'objects' else '[]'::jsonb end) o
  where o ->> 'kind' = 'space'
$$;

-- Every level, building insides included (what "My locations" shows).
create or replace function public.level_count(p public.published_maps) returns integer
language sql stable set search_path = '' as $$
  select case when jsonb_typeof(p.doc -> 'floors') = 'array' then jsonb_array_length(p.doc -> 'floors') else 1 end
$$;

revoke execute on function public.floor_count(public.maps), public.space_count(public.maps),
  public.floor_count(public.published_maps), public.space_count(public.published_maps), public.level_count(public.published_maps)
  from public, anon;
grant execute on function public.floor_count(public.maps), public.space_count(public.maps),
  public.floor_count(public.published_maps), public.space_count(public.published_maps), public.level_count(public.published_maps)
  to authenticated;

-- Let the API see the new columns right away.
notify pgrst, 'reload schema';
