-- Map pictures move out of the database into Supabase Storage (free plan: 1 GB of files).
--
-- Background images and imported pictures used to be stored inside each map
-- as text (data URLs). Every save, every saved version (up to 50 automatic
-- ones per map) and the published copy each carried the whole picture again,
-- which made saves slow and used up the free plan's 500 MB of database space.
-- Now each picture is one file in the public "map-images" bucket, at
-- <company id>/<fingerprint>.<type>, and maps keep only its address.
--
-- Who can do what:
--   * Anyone with a picture's address can load it. Employees and public site
--     links read maps without file permissions, so the bucket is public; the
--     address holds a 64-character fingerprint of the picture, so it can't be
--     guessed.
--   * Only people who can edit a company's maps (owners and managers, and
--     Bergeron Maps admins) can add pictures to that company's folder.
--   * Nobody can change or replace a stored picture (a new picture gets a new
--     name). Only admins can list or delete them (when a company is deleted).
--
-- Moving the pictures already inside maps is done once by an admin from All
-- accounts (Move map pictures to file storage), using the three admin_*
-- functions below.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('map-images', 'map-images', true, 20971520, array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- True when the signed-in person may add pictures to this company's folder.
create or replace function public.can_add_map_image(p_folder text)
returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_platform_admin() or exists (
    select 1 from public.memberships m
    where m.company_id::text = p_folder and m.user_id = auth.uid() and m.role in ('owner', 'manager')
  )
$$;
revoke all on function public.can_add_map_image(text) from public, anon;
grant execute on function public.can_add_map_image(text) to authenticated;

drop policy if exists map_images_add on storage.objects;
create policy map_images_add on storage.objects for insert to authenticated
  with check (
    bucket_id = 'map-images'
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{64}\.(png|jpg|webp|gif)$'
    and public.can_add_map_image((storage.foldername(name))[1])
  );

drop policy if exists map_images_admin_read on storage.objects;
create policy map_images_admin_read on storage.objects for select to authenticated
  using (bucket_id = 'map-images' and public.is_platform_admin());

drop policy if exists map_images_admin_delete on storage.objects;
create policy map_images_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'map-images' and public.is_platform_admin());

-- ------------------------------------------------ moving existing pictures

-- The pictures held inside one map (background images and imported pictures), as data URLs.
-- SVG drawings stay inside maps: they are small.
create or replace function public.inline_map_images(p_doc jsonb)
returns setof text
language sql immutable set search_path = '' as $$
  select s from (
    select jsonb_path_query(p_doc, '$.floors[*].background.src') #>> '{}' as s
    union all
    select jsonb_path_query(p_doc, '$.floors[*].objects[*].imageSrc') #>> '{}'
  ) x
  where s ~ '^data:image/(png|jpeg|webp|gif);base64,'
$$;
revoke all on function public.inline_map_images(jsonb) from public, anon, authenticated;

-- Every stored copy of a company's maps: working copies, published copies and saved versions.
create or replace function public.company_map_docs(p_company uuid)
returns setof jsonb
language sql stable security definer set search_path = public as $$
  select draft from public.maps where company_id = p_company
  union all
  select doc from public.published_maps where company_id = p_company
  union all
  select v.doc from public.map_versions v join public.maps m on m.id = v.map_id where m.company_id = p_company
$$;
revoke all on function public.company_map_docs(uuid) from public, anon, authenticated;

create or replace function public.map_image_hash(p_src text)
returns text
language sql immutable set search_path = '' as $$
  select encode(sha256(convert_to(p_src, 'UTF8')), 'hex')
$$;
revoke all on function public.map_image_hash(text) from public, anon, authenticated;

-- Admins: the pictures still held inside maps, one row per company and picture.
-- The fingerprint (hash) is the SHA-256 of the data URL, the same one the app names files by.
create or replace function public.admin_inline_images()
returns table (company_id uuid, hash text, bytes integer)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Only Bergeron Maps admins can move map pictures.' using errcode = '42501';
  end if;
  return query
    select x.company_id, public.map_image_hash(x.src), octet_length(x.src)
    from (
      select distinct c.id as company_id, s.src
      from public.companies c
      cross join lateral public.company_map_docs(c.id) d(doc)
      cross join lateral public.inline_map_images(d.doc) s(src)
    ) x
    order by 1, 2;
end $$;
revoke all on function public.admin_inline_images() from public, anon;
grant execute on function public.admin_inline_images() to authenticated;

-- Admins: one picture held inside a company's maps, by its fingerprint.
create or replace function public.admin_inline_image(p_company uuid, p_hash text)
returns text
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Only Bergeron Maps admins can move map pictures.' using errcode = '42501';
  end if;
  return (
    select s.src
    from public.company_map_docs(p_company) d(doc)
    cross join lateral public.inline_map_images(d.doc) s(src)
    where public.map_image_hash(s.src) = p_hash
    limit 1
  );
end $$;
revoke all on function public.admin_inline_image(uuid, text) from public, anon;
grant execute on function public.admin_inline_image(uuid, text) to authenticated;

-- Admins: after the picture is uploaded, points every copy of the company's maps
-- that holds it at the stored file. Returns how many copies changed.
create or replace function public.admin_swap_inline_image(p_company uuid, p_hash text, p_url text)
returns integer
language plpgsql security definer set search_path = public as $$
declare v_src text; n integer := 0; k integer;
begin
  if not public.is_platform_admin() then
    raise exception 'Only Bergeron Maps admins can move map pictures.' using errcode = '42501';
  end if;
  if p_hash !~ '^[0-9a-f]{64}$'
     or p_url !~ ('^https://[a-z0-9.-]+(:[0-9]+)?/storage/v1/object/public/map-images/' || p_company::text || '/' || p_hash || '\.(png|jpg|webp|gif)$') then
    raise exception 'That isn''t the stored address of this picture.' using errcode = '22023';
  end if;
  v_src := public.admin_inline_image(p_company, p_hash);
  if v_src is null then
    return 0;
  end if;
  -- The picture's text is unique (thousands of characters of base64), so a plain text swap is exact.
  update public.maps set draft = replace(draft::text, v_src, p_url)::jsonb
  where company_id = p_company and strpos(draft::text, v_src) > 0;
  get diagnostics k = row_count; n := n + k;
  update public.published_maps set doc = replace(doc::text, v_src, p_url)::jsonb
  where company_id = p_company and strpos(doc::text, v_src) > 0;
  get diagnostics k = row_count; n := n + k;
  update public.map_versions v set doc = replace(v.doc::text, v_src, p_url)::jsonb
  from public.maps m
  where m.id = v.map_id and m.company_id = p_company and strpos(v.doc::text, v_src) > 0;
  get diagnostics k = row_count; n := n + k;
  perform public.log_action(p_company, 'map.pictures_moved', p_hash, jsonb_build_object('copies', n));
  return n;
end $$;
revoke all on function public.admin_swap_inline_image(uuid, text, text) from public, anon;
grant execute on function public.admin_swap_inline_image(uuid, text, text) to authenticated;
