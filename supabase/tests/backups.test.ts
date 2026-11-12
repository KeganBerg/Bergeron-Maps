/**
 * Account backups (migration 20261112020000): a company deleted from All
 * accounts comes back from its backup with the same ids, links, join codes,
 * access, maps, published versions and saved versions.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const ADMIN_URL = process.env.DATABASE_URL;
if (!ADMIN_URL) throw new Error('Set DATABASE_URL to a Postgres server to run the database tests (see README).');

const dbName = `bm_bk_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
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
  await db.query('create table auth.sessions (id uuid primary key default gen_random_uuid(), user_id uuid not null)');
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

const doc = (name: string, n = 0) => ({ id: 'local', name, floors: [], schemaVersion: 1, n });

/** What the browser puts in a backup file, read the same way: as an admin, through row-level security. */
async function backup(staff: string, company: string) {
  const [{ admin_overview: all }] = await as<{ admin_overview: { id: string; name: string; created_at: string; max_sites: number | null; people: unknown[] }[] }>(
    staff, 'select public.admin_overview()');
  const c = all.find((x) => x.id === company)!;
  const sites = await as<{ id: string }>(staff, 'select id, name, slug, address, created_at from facilities where company_id = $1', [company]);
  for (const s of sites) {
    const [{ get_join_code }] = await as<{ get_join_code: string }>(staff, 'select public.get_join_code($1)', [s.id]);
    Object.assign(s, { join_code: get_join_code });
  }
  const maps = await as<{ id: string }>(staff,
    'select id, facility_id, name, slot, is_public, deleted_at, created_at, updated_at, revision, draft from maps where company_id = $1', [company]);
  const pubs = await as<{ map_id: string }>(staff, 'select map_id, name, doc, revision, published_at from published_maps where company_id = $1', [company]);
  const out = [];
  for (const m of maps) {
    const versions = await as(staff, 'select id, created_at, reason, label, revision, doc from map_versions where map_id = $1 order by created_at desc', [m.id]);
    const p = pubs.find((x) => x.map_id === m.id);
    out.push({ ...m, published: p ?? null, versions });
  }
  return { ...c, exported_at: new Date().toISOString(), sites, maps: out };
}

let seq = 0;
let w: { staff: string; lead: string; employee: string; company: string; siteA: string; siteB: string; slugA: string; codeA: string };

beforeEach(async () => {
  seq++;
  const staff = await user(`staff${seq}@bergeronmaps.test`);
  await db.query('insert into platform_admins (email) values ($1)', [`staff${seq}@bergeronmaps.test`]);
  const lead = await user(`lead${seq}@company.test`);
  const employee = await user(`valet${seq}@personal.test`);
  const [{ setup_company: company }] = await as<{ setup_company: string }>(staff,
    `select public.setup_company('Company ${seq}', 'Site A', '100 Main St', $1, 4)`, [`lead${seq}@company.test`]);
  const [{ id: siteA, slug: slugA }] = await as<{ id: string; slug: string }>(staff, 'select id, slug from facilities where company_id = $1', [company]);
  const [{ add_contract_site: siteB }] = await as<{ add_contract_site: string }>(staff, `select public.add_contract_site($1, 'Site B', '200 Main St')`, [company]);
  const [{ join_code: codeA }] = (await db.query<{ join_code: string }>('select join_code from facilities where id = $1', [siteA])).rows;
  await as(employee, 'select public.join_site($1)', [codeA]);
  await as(lead, `select public.add_member($1, $2, 'manager', array[$3]::uuid[])`, [company, `later${seq}@company.test`, siteB]);
  w = { staff, lead, employee, company, siteA, siteB, slugA, codeA };
});

async function addMaps() {
  const [{ id: live }] = await as<{ id: string }>(w.lead, `insert into maps (facility_id, name, draft) values ($1, 'Garage', $2) returning id`, [w.siteA, doc('Garage')]);
  await as(w.lead, 'select public.publish_map($1)', [live]);
  await as(w.lead, `update maps set draft = $2 where id = $1`, [live, doc('Garage', 1)]); // unpublished changes
  const [{ id: same }] = await as<{ id: string }>(w.lead, `insert into maps (facility_id, name, draft, is_public) values ($1, 'Lot', $2, true) returning id`, [w.siteB, doc('Lot')]);
  await as(w.lead, 'select public.publish_map($1)', [same]);
  await as(w.lead, `insert into map_versions (map_id, reason, label, revision, doc) values ($1, 'manual', 'Before the move', 1, $2)`, [live, doc('Garage')]);
  const [{ id: trashed }] = await as<{ id: string }>(w.lead, `insert into maps (facility_id, name, draft) values ($1, 'Old', $2) returning id`, [w.siteA, doc('Old')]);
  await as(w.lead, 'update maps set deleted_at = now() where id = $1', [trashed]);
  return { live, same, trashed };
}

async function deleteCompany() {
  await as(w.staff, 'select public.admin_delete_company($1, $2)', [w.company, `Company ${seq}`]);
}

async function restore(b: unknown) {
  const core = { ...(b as { maps: { versions: unknown[] }[] }) };
  const maps = core.maps;
  const [{ admin_restore_company: r }] = await as<{ admin_restore_company: Record<string, unknown> }>(w.staff,
    'select public.admin_restore_company($1)', [JSON.stringify({ ...core, maps: maps.map(({ versions: _v, ...m }) => m) })]);
  let versions = 0;
  for (const m of maps as unknown as { id: string; versions: unknown[] }[]) {
    const [{ admin_restore_versions: n }] = await as<{ admin_restore_versions: number }>(w.staff,
      'select public.admin_restore_versions($1, $2)', [m.id, JSON.stringify(m.versions)]);
    versions += n;
  }
  return { ...r, versions };
}

describe('restoring a deleted company', () => {
  it('brings back sites with the same ids, links, addresses, join codes and site limit', async () => {
    await addMaps();
    const b = await backup(w.staff, w.company);
    await deleteCompany();
    const r = await restore(b);
    expect(r).toMatchObject({ name: `Company ${seq}`, sites: 2, maps: 3, published: 2, slug_changes: [] });
    const [c] = (await db.query('select name, max_sites from companies where id = $1', [w.company])).rows;
    expect(c).toEqual({ name: `Company ${seq}`, max_sites: 4 });
    const sites = (await db.query('select id, slug, address, join_code from facilities where company_id = $1 order by name', [w.company])).rows;
    expect(sites[0]).toEqual({ id: w.siteA, slug: w.slugA, address: '100 Main St', join_code: w.codeA });
    expect(sites[1].id).toBe(w.siteB);
    expect((await db.query(`select 1 from audit_log where action = 'company.restored' and company_id = $1`, [w.company])).rowCount).toBe(1);
  });

  it('gives access back to people who still have a sign-in, and invites the rest', async () => {
    const b = await backup(w.staff, w.company);
    await deleteCompany();
    const r = await restore(b);
    expect(r).toMatchObject({ members: 2, invited: 1 });
    const m = (await db.query('select user_id, role, facility_ids from memberships where company_id = $1', [w.company])).rows;
    expect(m).toContainEqual({ user_id: w.lead, role: 'owner', facility_ids: null });
    expect(m).toContainEqual({ user_id: w.employee, role: 'employee', facility_ids: [w.siteA] });
    const inv = (await db.query('select email, role, facility_ids from invitations where company_id = $1', [w.company])).rows;
    expect(inv).toEqual([{ email: `later${seq}@company.test`, role: 'manager', facility_ids: [w.siteB] }]);
    // The lead can work on the restored maps again.
    expect(await as(w.lead, 'select id from facilities where company_id = $1', [w.company])).toHaveLength(2);
  });

  it('brings back every map with its slot, what employees saw, trash and saved versions', async () => {
    const { live, same, trashed } = await addMaps();
    const before = (await db.query('select id, slot, draft, is_public from maps where company_id = $1 order by name', [w.company])).rows;
    const versionsBefore = (await db.query('select count(*)::int n from map_versions v join maps m on m.id = v.map_id where m.company_id = $1', [w.company])).rows[0].n;
    const b = await backup(w.staff, w.company);
    await deleteCompany();
    const r = await restore(b);
    expect(r.versions).toBe(versionsBefore);
    const after = (await db.query('select id, slot, draft, is_public from maps where company_id = $1 order by name', [w.company])).rows;
    expect(after).toEqual(before);
    expect((await db.query('select deleted_at is not null t from maps where id = $1', [trashed])).rows[0].t).toBe(true);
    // Employees see the same published maps; the one with unpublished changes still shows them.
    const pub = (await db.query('select p.map_id, p.revision = m.revision same from published_maps p join maps m on m.id = p.map_id where p.company_id = $1', [w.company])).rows;
    expect(pub).toContainEqual({ map_id: same, same: true });
    expect(pub).toContainEqual({ map_id: live, same: false });
    const seen = await as<{ name: string }>(w.employee, 'select name from published_maps where company_id = $1', [w.company]);
    expect(seen.map((x) => x.name)).toEqual(['Garage']);
    // Sending the versions twice adds nothing.
    const [{ admin_restore_versions: again }] = await as<{ admin_restore_versions: number }>(w.staff,
      'select public.admin_restore_versions($1, $2)', [live, JSON.stringify((b.maps.find((m) => m.id === live) as { versions: unknown[] }).versions)]);
    expect(again).toBe(0);
  });

  it('uses a new link and join code when another site took them in the meantime', async () => {
    const b = await backup(w.staff, w.company);
    await deleteCompany();
    const [{ setup_company: other }] = await as<{ setup_company: string }>(w.staff, `select public.setup_company('Other', 'Site A', null, null, 1)`);
    const [{ slug }] = (await db.query('select slug from facilities where company_id = $1', [other])).rows;
    expect(slug).toBe(w.slugA);
    await db.query(`select set_config('bm.allow_code_change', 'on', false)`);
    await db.query('update facilities set join_code = $2 where company_id = $1', [other, w.codeA]);
    await db.query(`select set_config('bm.allow_code_change', 'off', false)`);
    const r = await restore(b) as { slug_changes: { was: string; now: string }[] };
    const [s] = (await db.query('select slug, join_code from facilities where id = $1', [w.siteA])).rows;
    expect(s.slug).not.toBe(w.slugA);
    expect(r.slug_changes).toEqual([{ site: 'Site A', was: w.slugA, now: s.slug }]);
    expect(s.join_code).not.toBe(w.codeA);
  });

  it('never overwrites a company that still exists, and only admins can restore', async () => {
    const b = await backup(w.staff, w.company);
    await expect(restore(b)).rejects.toThrow(/still in All accounts/);
    await deleteCompany();
    await expect(as(w.lead, 'select public.admin_restore_company($1)', [JSON.stringify(b)])).rejects.toThrow(/Only Bergeron Maps admins/);
    await expect(as(null, 'select public.admin_restore_company($1)', [JSON.stringify(b)])).rejects.toThrow(/permission denied/);
    await expect(as(w.lead, 'select public.admin_restore_versions($1, $2)', [w.siteA, '[]'])).rejects.toThrow(/Only Bergeron Maps admins/);
    expect((await db.query('select 1 from companies where id = $1', [w.company])).rowCount).toBe(0);
  });

  it('a damaged backup changes nothing', async () => {
    await addMaps();
    const b = await backup(w.staff, w.company) as { maps: { facility_id: string }[] };
    b.maps[0].facility_id = '00000000-0000-0000-0000-000000000000';
    await deleteCompany();
    await expect(restore(b)).rejects.toThrow(/damaged/);
    expect((await db.query('select 1 from companies where id = $1', [w.company])).rowCount).toBe(0);
    expect((await db.query('select 1 from facilities where id = $1', [w.siteA])).rowCount).toBe(0);
  });
});
