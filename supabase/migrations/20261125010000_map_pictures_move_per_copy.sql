-- Moving pictures already inside maps, one saved copy at a time (follows 20261124040000_map_pictures_move_per_map).
--
-- Supabase stops any single request after 8 seconds. Working one map per request
-- (20261124040000) still ran out of time on maps with many saved versions full of
-- pictures, because each request read every version of the map. These functions
-- read and write one copy (a published map or one saved version) per request, so
-- a request's work no longer grows with the map's history. The app runs them in
-- the background when an admin opens All accounts; there is no button.
--
-- Working copies (maps.draft) are left alone: the app already moves their pictures
-- on the next save, and changing them here would bump the map's revision under
-- someone who has it open. The earlier move functions stay, unused.

-- One copy's document and company. Kind is 'published' (id = the map) or 'version' (id = the version).
create or replace function public.map_copy_doc(p_kind text, p_id uuid, out doc jsonb, out company_id uuid)
language sql stable security definer set search_path = public as $$
  select p.doc, p.company_id from public.published_maps p where p_kind = 'published' and p.map_id = p_id
  union all
  select v.doc, m.company_id from public.map_versions v join public.maps m on m.id = v.map_id where p_kind = 'version' and v.id = p_id
$$;
revoke all on function public.map_copy_doc(text, uuid) from public, anon, authenticated;

-- Admins: one map's saved copies that may hold pictures: its published copy and its saved versions, newest first.
-- Reads no documents, so it is quick however large they are.
create or replace function public.admin_map_copies(p_map uuid)
returns table (kind text, id uuid)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Only Bergeron Maps admins can move map pictures.' using errcode = '42501';
  end if;
  return query
    select 'published'::text, p.map_id from public.published_maps p where p.map_id = p_map
    union all
    select 'version'::text, x.id from (
      select v.id, v.created_at from public.map_versions v where v.map_id = p_map order by v.created_at desc
    ) x;
end $$;
revoke all on function public.admin_map_copies(uuid) from public, anon;
grant execute on function public.admin_map_copies(uuid) to authenticated;

-- Admins: points one copy's pictures at their stored files. p_hashes and p_urls pair up
-- the pictures already in storage (fingerprint and address). Gives back the fingerprints
-- of pictures still inside the copy that weren't in the list; the app uploads those and calls again.
create or replace function public.admin_move_copy_images(p_kind text, p_id uuid, p_hashes text[], p_urls text[])
returns text[]
language plpgsql security definer set search_path = public as $$
declare
  v_doc jsonb; v_company uuid; v_text text; v_src text; v_hash text; v_url text; i integer;
  v_left text[] := '{}'; v_changed boolean := false;
begin
  if not public.is_platform_admin() then
    raise exception 'Only Bergeron Maps admins can move map pictures.' using errcode = '42501';
  end if;
  if coalesce(cardinality(p_hashes), 0) <> coalesce(cardinality(p_urls), 0) then
    raise exception 'Each picture needs one address.' using errcode = '22023';
  end if;
  select d.doc, d.company_id into v_doc, v_company from public.map_copy_doc(p_kind, p_id) d;
  if v_doc is null then
    return v_left;
  end if;
  v_text := v_doc::text;
  for v_src in select distinct s.src from public.inline_map_images(v_doc) s(src) loop
    v_hash := public.map_image_hash(v_src);
    i := array_position(p_hashes, v_hash);
    if i is null then
      v_left := v_left || v_hash;
      continue;
    end if;
    v_url := p_urls[i];
    -- The picture is named by its fingerprint, so the address must match the company and the picture.
    if v_url !~ ('^https://[a-z0-9.-]+(:[0-9]+)?/storage/v1/object/public/map-images/' || v_company::text || '/' || v_hash || '\.(png|jpg|webp|gif)$') then
      raise exception 'That isn''t the stored address of this picture.' using errcode = '22023';
    end if;
    -- The picture's text is unique (thousands of characters of base64), so a plain text swap is exact.
    v_text := replace(v_text, v_src, v_url);
    v_changed := true;
  end loop;
  if v_changed then
    if p_kind = 'published' then
      update public.published_maps set doc = v_text::jsonb where map_id = p_id;
    else
      update public.map_versions set doc = v_text::jsonb where id = p_id;
    end if;
  end if;
  return v_left;
end $$;
revoke all on function public.admin_move_copy_images(text, uuid, text[], text[]) from public, anon;
grant execute on function public.admin_move_copy_images(text, uuid, text[], text[]) to authenticated;

-- Admins: one picture still inside a copy, by its fingerprint, so the app can upload it.
create or replace function public.admin_copy_inline_image(p_kind text, p_id uuid, p_hash text)
returns text
language plpgsql stable security definer set search_path = public as $$
declare v_src text;
begin
  if not public.is_platform_admin() then
    raise exception 'Only Bergeron Maps admins can move map pictures.' using errcode = '42501';
  end if;
  select s.src into v_src
  from public.map_copy_doc(p_kind, p_id) d
  cross join lateral public.inline_map_images(d.doc) s(src)
  where public.map_image_hash(s.src) = p_hash
  limit 1;
  return v_src;
end $$;
revoke all on function public.admin_copy_inline_image(text, uuid, text) from public, anon;
grant execute on function public.admin_copy_inline_image(text, uuid, text) to authenticated;
