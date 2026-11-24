/**
 * Map pictures in file storage (migration 20261124000000): who may add
 * pictures to a company's folder, and the admin-only move of pictures that
 * are still held inside maps, their published copies and their versions.
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const ADMIN_URL = process.env.DATABASE_URL;
if (!ADMIN_URL) throw new Error('Set DATABASE_URL to a Postgres server to run the database tests (see README).');

const dbName = `bm_img_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
let admin: pg.Client;
let db: pg.Client;

const root = join(__dirname, '..');
const sqlFiles = [
  join(root, 'tests', 'supabase-shim.sql'),
  ...readdirSync(join(root, 'migrations')).sort().map((f) => join(root, 'migrations', f)),
];

beforeAll(async () => {
  admin = new pg.Client({ connectionString: ADMIN_URL });
  await admin.connect();
  await admin.query(`create database ${dbName}`);
  const url = new URL(ADMIN_URL);
  url.pathname = `/${dbName}`;
  db = new pg.Client({ connectionString: url.toString() });
  await db.connect();
  for (const f of sqlFiles) await db.query(readFileSync(f, 'utf8'));
});

afterAll(async () => {
  await db?.end();
  await admin?.query(`drop database if exists ${dbName}`);
  await admin?.end();
});

async function as<T extends pg.QueryResultRow = Record<string, unknown>>(who: string | null, sql: string, params: unknown[] = []): Promise<T[]> {
  await db.query('begin');
  try {
    await db.query(`set local role ${who ? 'authenticated' : 'anon'}`);
    await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [who ?? '']);
    const r = await db.query<T>(sql, params);
    await db.query('commit');
    return r.rows;
  } catch (e) {
    await db.query('rollback');
    throw e;
  }
}

async function user(email: string): Promise<string> {
  const r = await db.query<{ id: string }>('insert into auth.users (email) values ($1) returning id', [email]);
  return r.rows[0].id;
}

const PNG = 'data:image/png;base64,' + 'iVBORw0KGgo'.repeat(500);
const JPG = 'data:image/jpeg;base64,' + '/9j/4AAQSkZJRg+'.repeat(400);
const SVG = 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=';
const hash = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');
const urlFor = (company: string, src: string, ext: string) =>
  `https://abcd.supabase.co/storage/v1/object/public/map-images/${company}/${hash(src)}.${ext}`;

const mapDoc = (bg: string, image: string) => ({
  id: 'local', name: 'Garage', schemaVersion: 1,
  floors: [{
    id: 'f1', name: 'Level 1', layers: [{ id: 'l1' }], rows: {},
    background: { layerId: 'l1', src: bg, x: 0, y: 0, width: 100, height: 100, opacity: 0.6 },
    objects: [
      { id: 'o1', kind: 'asset', assetKey: 'import-image', imageSrc: image, layerId: 'l1', x: 0, y: 0, width: 10, height: 10, rotation: 0 },
      { id: 'o2', kind: 'asset', assetKey: 'import-image', imageSrc: SVG, layerId: 'l1', x: 0, y: 0, width: 10, height: 10, rotation: 0 },
    ],
  }],
});

let seq = 0;
let w: { staff: string; lead: string; siteLead: string; employee: string; outsider: string; company: string; other: string; map: string };

beforeEach(async () => {
  seq++;
  const staff = await user(`staff${seq}@bergeronmaps.test`);
  await db.query('insert into platform_admins (email) values ($1)', [`staff${seq}@bergeronmaps.test`]);
  const lead = await user(`lead${seq}@company.test`);
  const siteLead = await user(`site${seq}@company.test`);
  const employee = await user(`valet${seq}@company.test`);
  const outsider = await user(`other${seq}@other.test`);
  const [{ setup_company: company }] = await as<{ setup_company: string }>(staff,
    `select public.setup_company('Company ${seq}', 'Site A', '100 Main St', $1, 4)`, [`lead${seq}@company.test`]);
  const [{ setup_company: other }] = await as<{ setup_company: string }>(staff,
    `select public.setup_company('Other ${seq}', 'Site Z', '9 Side St', $1, 4)`, [`other${seq}@other.test`]);
  const [{ id: site }] = await as<{ id: string }>(staff, 'select id from facilities where company_id = $1', [company]);
  await as(lead, `select public.add_member($1, $2, 'manager', array[$3]::uuid[])`, [company, `site${seq}@company.test`, site]);
  await as(lead, `select public.add_member($1, $2, 'employee', array[$3]::uuid[])`, [company, `valet${seq}@company.test`, site]);
  const [{ id: map }] = await as<{ id: string }>(lead, `insert into maps (facility_id, name, draft) values ($1, 'Garage', $2) returning id`, [site, mapDoc(PNG, JPG)]);
  await as(lead, 'select public.publish_map($1)', [map]);
  await as(lead, `insert into map_versions (map_id, reason, label, revision, doc) values ($1, 'auto', 'Auto', 1, $2)`, [map, mapDoc(PNG, JPG)]);
  await as(lead, `insert into map_versions (map_id, reason, label, revision, doc) values ($1, 'manual', 'Old', 1, $2)`, [map, mapDoc(PNG, SVG)]);
  w = { staff, lead, siteLead, employee, outsider, company, other, map };
});

const addFile = (who: string | null, name: string) =>
  as(who, `insert into storage.objects (bucket_id, name) values ('map-images', $1)`, [name]);
const file = (company: string, ext = 'png') => `${company}/${hash(String(Math.random()))}.${ext}`;

describe('adding pictures to file storage', () => {
  it('lets owners and managers (even of one site) and admins add pictures to their company’s folder', async () => {
    await addFile(w.lead, file(w.company));
    await addFile(w.siteLead, file(w.company, 'jpg'));
    await addFile(w.staff, file(w.other, 'webp'));
  });

  it('refuses employees, other companies, signed-out visitors, bad names and other buckets', async () => {
    await expect(addFile(w.employee, file(w.company))).rejects.toThrow(/row-level security/);
    await expect(addFile(w.outsider, file(w.company))).rejects.toThrow(/row-level security/);
    await expect(addFile(null, file(w.company))).rejects.toThrow(/row-level security|permission/);
    await expect(addFile(w.lead, `${w.company}/sketch.png`)).rejects.toThrow(/row-level security/);
    await expect(addFile(w.lead, `${w.company}/${hash('x')}.svg`)).rejects.toThrow(/row-level security/);
    await expect(addFile(w.lead, `${w.company}/a/${hash('x')}.png`)).rejects.toThrow(/row-level security/);
    await db.query(`insert into storage.buckets (id, name) values ('other', 'other') on conflict do nothing`);
    await expect(as(w.lead, `insert into storage.objects (bucket_id, name) values ('other', $1)`, [file(w.company)])).rejects.toThrow(/row-level security/);
  });

  it('never lets anyone replace a stored picture, and only admins list or delete them', async () => {
    const name = file(w.company);
    await addFile(w.lead, name);
    expect(await as(w.lead, `update storage.objects set name = name where name = $1 returning id`, [name])).toHaveLength(0);
    expect(await as(w.lead, `select name from storage.objects where name = $1`, [name])).toHaveLength(0);
    expect(await as(w.lead, `delete from storage.objects where name = $1 returning id`, [name])).toHaveLength(0);
    expect(await as(w.staff, `select name from storage.objects where name = $1`, [name])).toHaveLength(1);
    expect(await as(w.staff, `delete from storage.objects where name = $1 returning id`, [name])).toHaveLength(1);
  });

  it('makes the bucket public, limited to raster pictures of up to 20 MB', async () => {
    const [b] = (await db.query(`select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'map-images'`)).rows;
    expect(b).toEqual({ public: true, file_size_limit: '20971520', allowed_mime_types: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] });
  });
});

describe('moving pictures already inside maps', () => {
  it('lists each company’s pictures once (not SVG drawings), with the fingerprint the app names files by', async () => {
    const rows = await as<{ company_id: string; hash: string; bytes: number }>(w.staff, 'select * from public.admin_inline_images()');
    const mine = rows.filter((r) => r.company_id === w.company);
    expect(mine.map((r) => r.hash).sort()).toEqual([hash(PNG), hash(JPG)].sort());
    expect(mine.find((r) => r.hash === hash(PNG))!.bytes).toBe(PNG.length);
    const [{ admin_inline_image: src }] = await as<{ admin_inline_image: string }>(w.staff, 'select public.admin_inline_image($1, $2)', [w.company, hash(JPG)]);
    expect(src).toBe(JPG);
  });

  it('points the working copy, the published copy and every version at the stored file', async () => {
    const [{ revision: before }] = (await db.query('select revision from maps where id = $1', [w.map])).rows;
    const png = urlFor(w.company, PNG, 'png');
    const [{ admin_swap_inline_image: n }] = await as<{ admin_swap_inline_image: number }>(w.staff,
      'select public.admin_swap_inline_image($1, $2, $3)', [w.company, hash(PNG), png]);
    expect(n).toBe(5); // draft, published copy, and three versions (publishing adds one)
    const draft = (await db.query('select draft, revision from maps where id = $1', [w.map])).rows[0];
    expect(draft.draft.floors[0].background.src).toBe(png);
    expect(draft.draft.floors[0].objects[0].imageSrc).toBe(JPG);
    expect(draft.draft.floors[0].objects[1].imageSrc).toBe(SVG);
    expect(draft.revision).toBe(before + 1);
    const pub = (await db.query('select doc from published_maps where map_id = $1', [w.map])).rows[0].doc;
    expect(pub.floors[0].background.src).toBe(png);
    const versions = (await db.query('select doc from map_versions where map_id = $1', [w.map])).rows;
    expect(versions.every((v) => v.doc.floors[0].background.src === png)).toBe(true);

    const jpg = urlFor(w.company, JPG, 'jpg');
    await as(w.staff, 'select public.admin_swap_inline_image($1, $2, $3)', [w.company, hash(JPG), jpg]);
    const left = await as<{ company_id: string }>(w.staff, 'select * from public.admin_inline_images()');
    expect(left.filter((r) => r.company_id === w.company)).toEqual([]);
    // Running it again finds nothing to do.
    const [{ admin_swap_inline_image: again }] = await as<{ admin_swap_inline_image: number }>(w.staff,
      'select public.admin_swap_inline_image($1, $2, $3)', [w.company, hash(JPG), jpg]);
    expect(again).toBe(0);
  });

  it('refuses addresses that aren’t this picture’s stored file', async () => {
    const swap = (url: string, h = hash(PNG)) => as(w.staff, 'select public.admin_swap_inline_image($1, $2, $3)', [w.company, h, url]);
    await expect(swap(urlFor(w.other, PNG, 'png'))).rejects.toThrow(/stored address/);
    await expect(swap(urlFor(w.company, JPG, 'png'))).rejects.toThrow(/stored address/);
    await expect(swap('https://evil.test/x.png')).rejects.toThrow(/stored address/);
    await expect(swap(urlFor(w.company, PNG, 'png'), '.*')).rejects.toThrow(/stored address/);
  });

  it('is for Bergeron Maps admins only', async () => {
    await expect(as(w.lead, 'select * from public.admin_inline_images()')).rejects.toThrow(/Only Bergeron Maps admins/);
    await expect(as(w.lead, 'select public.admin_inline_image($1, $2)', [w.company, hash(PNG)])).rejects.toThrow(/Only Bergeron Maps admins/);
    await expect(as(w.lead, 'select public.admin_swap_inline_image($1, $2, $3)', [w.company, hash(PNG), urlFor(w.company, PNG, 'png')]))
      .rejects.toThrow(/Only Bergeron Maps admins/);
    await expect(as(null, 'select * from public.admin_inline_images()')).rejects.toThrow(/permission denied/);
    await expect(as(w.lead, 'select * from public.company_map_docs($1)', [w.company])).rejects.toThrow(/permission denied/);
  });
});

describe('moving pictures one map at a time (step 17)', () => {
  const swap = (who: string, url: string, src = PNG, h = hash(PNG)) =>
    as<{ n: number }>(who, 'select public.admin_swap_map_image($1, $2, $3, $4) as n', [w.map, h, url, src]);

  it('lists one map’s pictures, gives each back, and swaps versions at most 10 at a time', async () => {
    for (let i = 0; i < 12; i++) {
      await as(w.lead, `insert into map_versions (map_id, reason, label, revision, doc) values ($1, 'manual', 'More', 1, $2)`, [w.map, mapDoc(PNG, JPG)]);
    }
    const found = await as<{ hash: string }>(w.staff, 'select * from public.admin_map_inline_images($1)', [w.map]);
    expect(found.map((r) => r.hash).sort()).toEqual([hash(PNG), hash(JPG)].sort());
    const [{ src }] = await as<{ src: string }>(w.staff, 'select public.admin_map_inline_image($1, $2) as src', [w.map, hash(JPG)]);
    expect(src).toBe(JPG);

    const url = urlFor(w.company, PNG, 'png');
    const rounds: number[] = [];
    for (;;) {
      const [{ n }] = await swap(w.staff, url);
      rounds.push(n);
      if (n === 0) break;
    }
    // draft + published + 10 versions, then the other 5 (3 from setup + 12 added), then nothing left.
    expect(rounds).toEqual([12, 5, 0]);
    const left = (await db.query(`select count(*)::int as n from map_versions where map_id = $1 and strpos(doc::text, $2) > 0`, [w.map, PNG])).rows[0].n;
    expect(left).toBe(0);
    const found2 = await as<{ hash: string }>(w.staff, 'select * from public.admin_map_inline_images($1)', [w.map]);
    expect(found2.map((r) => r.hash)).toEqual([hash(JPG)]);
  });

  it('refuses a picture that doesn’t match its fingerprint or address, and anyone but admins', async () => {
    await expect(swap(w.staff, urlFor(w.other, PNG, 'png'))).rejects.toThrow(/stored address/);
    await expect(swap(w.staff, urlFor(w.company, PNG, 'png'), JPG)).rejects.toThrow(/stored address/);
    await expect(swap(w.staff, urlFor(w.company, SVG, 'png'), SVG, hash(SVG))).rejects.toThrow(/stored address/);
    await expect(swap(w.lead, urlFor(w.company, PNG, 'png'))).rejects.toThrow(/Only Bergeron Maps admins/);
    await expect(as(w.lead, 'select * from public.admin_map_inline_images($1)', [w.map])).rejects.toThrow(/Only Bergeron Maps admins/);
    await expect(as(null, 'select * from public.admin_map_inline_images($1)', [w.map])).rejects.toThrow(/permission denied/);
  });
});

