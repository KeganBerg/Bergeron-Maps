-- Moving pictures already inside maps, one map at a time (follows 20261124000000_map_pictures_storage).
--
-- Supabase stops any single request after 8 seconds. The first version of the
-- move (admin_inline_images and friends) looked through every map of every
-- company in one request, which takes longer than that once maps hold many
-- saved versions with pictures. These do the same work for one map per
-- request, and swap at most 10 saved versions per call, so each request stays
-- short. The app calls them in a loop. The earlier functions stay, unused.

-- Admins: the pictures still held inside one map (working copy, published copy, saved versions).
create or replace function public.admin_map_inline_images(p_map uuid)
returns table (hash text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Only Bergeron Maps admins can move map pictures.' using errcode = '42501';
  end if;
  return query
    select distinct public.map_image_hash(s.src)
    from (
      select draft as doc from public.maps where id = p_map
      union all select doc from public.published_maps where map_id = p_map
      union all select doc from public.map_versions where map_id = p_map
    ) d
    cross join lateral public.inline_map_images(d.doc) s(src);
end $$;
revoke all on function public.admin_map_inline_images(uuid) from public, anon;
grant execute on function public.admin_map_inline_images(uuid) to authenticated;

-- Admins: one picture held inside a map, by its fingerprint. Looks at the working copy
-- and published copy first, then versions, newest first, and stops at the first match.
create or replace function public.admin_map_inline_image(p_map uuid, p_hash text)
returns text
language plpgsql stable security definer set search_path = public as $$
declare v_doc jsonb; v_src text;
begin
  if not public.is_platform_admin() then
    raise exception 'Only Bergeron Maps admins can move map pictures.' using errcode = '42501';
  end if;
  for v_doc in
    select draft from public.maps where id = p_map
    union all select doc from public.published_maps where map_id = p_map
    union all (select doc from public.map_versions where map_id = p_map order by created_at desc)
  loop
    select s.src into v_src from public.inline_map_images(v_doc) s(src) where public.map_image_hash(s.src) = p_hash limit 1;
    if v_src is not null then
      return v_src;
    end if;
  end loop;
  return null;
end $$;
revoke all on function public.admin_map_inline_image(uuid, text) from public, anon;
grant execute on function public.admin_map_inline_image(uuid, text) to authenticated;

-- Admins: after the picture is uploaded, points one map's copies that hold it at the
-- stored file: the working copy, the published copy, and up to 10 saved versions per call.
-- Returns how many copies changed; the app calls again until it returns 0.
create or replace function public.admin_swap_map_image(p_map uuid, p_hash text, p_url text, p_src text)
returns integer
language plpgsql security definer set search_path = public as $$
declare v_company uuid; n integer := 0; k integer;
begin
  if not public.is_platform_admin() then
    raise exception 'Only Bergeron Maps admins can move map pictures.' using errcode = '42501';
  end if;
  select company_id into v_company from public.maps where id = p_map;
  if v_company is null then
    return 0;
  end if;
  -- The picture is named by its fingerprint, so the address and the picture must match.
  if p_hash !~ '^[0-9a-f]{64}$' or public.map_image_hash(p_src) <> p_hash
     or p_src !~ '^data:image/(png|jpeg|webp|gif);base64,'
     or p_url !~ ('^https://[a-z0-9.-]+(:[0-9]+)?/storage/v1/object/public/map-images/' || v_company::text || '/' || p_hash || '\.(png|jpg|webp|gif)$') then
    raise exception 'That isn''t the stored address of this picture.' using errcode = '22023';
  end if;
  -- The picture's text is unique (thousands of characters of base64), so a plain text swap is exact.
  update public.maps set draft = replace(draft::text, p_src, p_url)::jsonb
  where id = p_map and strpos(draft::text, p_src) > 0;
  get diagnostics k = row_count; n := n + k;
  update public.published_maps set doc = replace(doc::text, p_src, p_url)::jsonb
  where map_id = p_map and strpos(doc::text, p_src) > 0;
  get diagnostics k = row_count; n := n + k;
  update public.map_versions set doc = replace(doc::text, p_src, p_url)::jsonb
  where id in (
    select id from public.map_versions where map_id = p_map and strpos(doc::text, p_src) > 0 limit 10
  );
  get diagnostics k = row_count; n := n + k;
  if n > 0 then
    perform public.log_action(v_company, 'map.pictures_moved', p_hash, jsonb_build_object('map', p_map, 'copies', n));
  end if;
  return n;
end $$;
revoke all on function public.admin_swap_map_image(uuid, text, text, text) from public, anon;
grant execute on function public.admin_swap_map_image(uuid, text, text, text) to authenticated;
