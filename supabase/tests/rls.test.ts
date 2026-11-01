/**
 * Tests the Phase 2 security model directly in Postgres: these are the rules
 * that protect data no matter what the browser does.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const ADMIN_URL = process.env.DATABASE_URL;
if (!ADMIN_URL) throw new Error('Set DATABASE_URL to a Postgres server to run the database tests (see README).');

const dbName = `bm_rls_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
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

type Who = string | null; // user id, or null for an anonymous visitor

/** Runs SQL as a signed-in user (or anon) inside one transaction, like a Supabase request. */
async function as<T extends pg.QueryResultRow = Record<string, unknown>>(who: Who, sql: string, params: unknown[] = []): Promise<T[]> {
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

const doc = (name: string) => ({ id: 'local', name, floors: [], schemaVersion: 1 });

interface World {
  owner: string;
  manager: string;
  employee: string;
  scopedEmployee: string;
  outsider: string;
  admin: string;
  company: string;
  facilityA: string;
  facilityB: string;
  otherCompany: string;
  otherMap: string;
  map: string;
}

let w: World;
let seq = 0;

beforeEach(async () => {
  seq++;
  const owner = await user(`owner${seq}@acme.test`);
  const manager = await user(`manager${seq}@acme.test`);
  const employee = await user(`employee${seq}@acme.test`);
  const scopedEmployee = await user(`scoped${seq}@acme.test`);
  const outsider = await user(`outsider${seq}@other.test`);
  await db.query('insert into platform_admins (email) values ($1), ($2)', [`owner${seq}@acme.test`, `outsider${seq}@other.test`]);

  const [{ create_company: company }] = await as<{ create_company: string }>(owner, `select public.create_company('Acme Valet', 'Harbor Hotel')`);
  const [{ id: facilityA }] = await as<{ id: string }>(owner, 'select id from facilities where company_id = $1', [company]);
  const [{ id: facilityB }] = await as<{ id: string }>(owner, `insert into facilities (company_id, name) values ($1, 'Stadium Lot') returning id`, [company]);
  await as(owner, `select public.add_member($1, $2, 'manager')`, [company, `manager${seq}@acme.test`]);
  await as(owner, `select public.add_member($1, $2, 'employee')`, [company, `employee${seq}@acme.test`]);
  await as(owner, `select public.add_member($1, $2, 'employee', array[$3]::uuid[])`, [company, `scoped${seq}@acme.test`, facilityB]);

  const [{ id: map }] = await as<{ id: string }>(manager, `insert into maps (facility_id, name, draft) values ($1, 'Harbor Garage', $2) returning id`, [facilityA, doc('v1')]);

  const [{ create_company: otherCompany }] = await as<{ create_company: string }>(outsider, `select public.create_company('Rival Parking', 'Downtown')`);
  const [{ id: otherFacility }] = await as<{ id: string }>(outsider, 'select id from facilities where company_id = $1', [otherCompany]);
  const [{ id: otherMap }] = await as<{ id: string }>(outsider, `insert into maps (facility_id, name, draft) values ($1, 'Secret', $2) returning id`, [otherFacility, doc('secret')]);
  await as(outsider, 'select public.publish_map($1)', [otherMap]);

  // Company setup is done by admins; from here on the customers are plain members,
  // and a separate Bergeron Maps admin oversees everything.
  await db.query('delete from platform_admins where email in ($1, $2)', [`owner${seq}@acme.test`, `outsider${seq}@other.test`]);
  const admin = await user(`admin${seq}@bergeronmaps.test`);
  await db.query('insert into platform_admins (email) values ($1)', [`admin${seq}@bergeronmaps.test`]);

  w = { owner, manager, employee, scopedEmployee, outsider, admin, company, facilityA, facilityB, otherCompany, otherMap, map };
});

describe('company data separation', () => {
  it('members see only their own company, facilities and maps', async () => {
    expect((await as(w.manager, 'select id from companies')).map((r) => r.id)).toEqual([w.company]);
    expect(await as(w.manager, 'select * from maps where id = $1', [w.otherMap])).toEqual([]);
    expect(await as(w.manager, 'select * from published_maps where map_id = $1', [w.otherMap])).toEqual([]);
    expect(await as(w.outsider, 'select * from maps where id = $1', [w.map])).toEqual([]);
  });

  it('cannot create maps in, or move maps to, another company', async () => {
    const [{ id: otherFacility }] = await as<{ id: string }>(w.outsider, 'select id from facilities where company_id = $1', [w.otherCompany]);
    await expect(as(w.manager, `insert into maps (facility_id, name, draft) values ($1, 'x', '{}')`, [otherFacility])).rejects.toThrow(/row-level security/);
    await expect(as(w.manager, 'update maps set facility_id = $1 where id = $2', [otherFacility, w.map])).rejects.toThrow(/row-level security/);
  });

  it('cannot read or change another company through the member functions', async () => {
    await expect(as(w.manager, 'select * from public.list_members($1)', [w.otherCompany])).rejects.toThrow(/Only owners and managers/);
    await expect(as(w.manager, `select public.add_member($1, 'me@x.test', 'owner')`, [w.otherCompany])).rejects.toThrow(/Only owners and managers/);
    await expect(as(w.manager, 'select public.publish_map($1)', [w.otherMap])).rejects.toThrow(/permission/);
  });
});

describe('drafts and publishing', () => {
  it('employees see the published version, never the draft', async () => {
    expect(await as(w.employee, 'select * from maps')).toEqual([]);
    expect(await as(w.employee, 'select * from published_maps where map_id = $1', [w.map])).toEqual([]);
    await as(w.manager, 'select public.publish_map($1)', [w.map]);
    await as(w.manager, 'update maps set draft = $1 where id = $2', [doc('v2 unfinished'), w.map]);
    const [p] = await as<{ doc: { name: string } }>(w.employee, 'select doc from published_maps where map_id = $1', [w.map]);
    expect(p.doc.name).toBe('v1');
    await as(w.manager, 'select public.publish_map($1)', [w.map]);
    const [p2] = await as<{ doc: { name: string } }>(w.employee, 'select doc from published_maps where map_id = $1', [w.map]);
    expect(p2.doc.name).toBe('v2 unfinished');
  });

  it('employees cannot edit, publish or delete maps', async () => {
    const rows = await as(w.employee, `update maps set name = 'hacked' where id = $1 returning id`, [w.map]);
    expect(rows).toEqual([]);
    await expect(as(w.employee, 'select public.publish_map($1)', [w.map])).rejects.toThrow(/permission/);
    expect(await as(w.employee, 'delete from maps where id = $1 returning id', [w.map])).toEqual([]);
  });

  it('facility-limited employees only see their facility', async () => {
    await as(w.manager, 'select public.publish_map($1)', [w.map]); // map is at facility A
    expect(await as(w.scopedEmployee, 'select * from published_maps')).toEqual([]);
    expect((await as(w.scopedEmployee, 'select id from facilities')).map((r) => r.id)).toEqual([w.facilityB]);
    expect((await as(w.employee, 'select map_id from published_maps')).map((r) => r.map_id)).toEqual([w.map]);
  });

  it('trashed maps disappear for employees and cannot be published', async () => {
    await as(w.manager, 'select public.publish_map($1)', [w.map]);
    await as(w.manager, 'update maps set deleted_at = now() where id = $1', [w.map]);
    expect(await as(w.employee, 'select * from published_maps')).toEqual([]);
    await expect(as(w.manager, 'select public.publish_map($1)', [w.map])).rejects.toThrow(/Restore this map/);
    await as(w.manager, 'update maps set deleted_at = null where id = $1', [w.map]);
    expect(await as(w.employee, 'select * from published_maps')).toHaveLength(1);
  });

  it('only trashed maps can be permanently deleted', async () => {
    expect(await as(w.manager, 'delete from maps where id = $1 returning id', [w.map])).toEqual([]);
    await as(w.manager, 'update maps set deleted_at = now() where id = $1', [w.map]);
    expect(await as(w.manager, 'delete from maps where id = $1 returning id', [w.map])).toHaveLength(1);
  });
});

describe('public and private maps', () => {
  it('private maps are not reachable by link, even with the id', async () => {
    await as(w.manager, 'select public.publish_map($1)', [w.map]);
    expect(await as(null, 'select * from public.get_public_map($1)', [w.map])).toEqual([]);
    await expect(as(null, 'select * from published_maps')).rejects.toThrow(/permission denied/);
    await expect(as(null, 'select * from maps')).rejects.toThrow(/permission denied/);
  });

  it('public maps show only the published version to anyone with the link', async () => {
    await as(w.manager, 'select public.publish_map($1)', [w.map]);
    await as(w.manager, 'update maps set is_public = true, draft = $1 where id = $2', [doc('draft'), w.map]);
    const [r] = await as<{ doc: { name: string } }>(null, 'select * from public.get_public_map($1)', [w.map]);
    expect(r.doc.name).toBe('v1');
    await as(w.manager, 'update maps set is_public = false where id = $1', [w.map]);
    expect(await as(null, 'select * from public.get_public_map($1)', [w.map])).toEqual([]);
  });

  it('anonymous visitors cannot call member functions', async () => {
    await expect(as(null, 'select public.publish_map($1)', [w.map])).rejects.toThrow(/permission denied/);
    await expect(as(null, `select public.create_company('x', 'y')`)).rejects.toThrow(/permission denied/);
  });
});

describe('managing access', () => {
  it('revoking access takes effect immediately', async () => {
    await as(w.manager, 'select public.publish_map($1)', [w.map]);
    expect(await as(w.employee, 'select * from published_maps')).toHaveLength(1);
    await as(w.manager, 'select public.remove_member($1, $2)', [w.company, w.employee]);
    expect(await as(w.employee, 'select * from published_maps')).toEqual([]);
    expect(await as(w.employee, 'select * from companies')).toEqual([]);
  });

  it('lists who has access, including pending invitations', async () => {
    await as(w.manager, `select public.add_member($1, 'New.Hire@Acme.test', 'employee')`, [w.company]);
    const members = await as<{ email: string; role: string; pending: boolean }>(w.manager, 'select * from public.list_members($1)', [w.company]);
    expect(members.filter((m) => !m.pending)).toHaveLength(4);
    expect(members.find((m) => m.pending)).toMatchObject({ email: 'new.hire@acme.test', role: 'employee' });
    await expect(as(w.employee, 'select * from public.list_members($1)', [w.company])).rejects.toThrow(/Only owners and managers/);
  });

  it('invited people get access when they sign up', async () => {
    const r = await as<{ add_member: string }>(w.manager, `select public.add_member($1, $2, 'employee')`, [w.company, `later${seq}@acme.test`]);
    expect(r[0].add_member).toBe('invited');
    const later = await user(`later${seq}@acme.test`);
    expect((await as(later, 'select id from companies')).map((x) => x.id)).toEqual([w.company]);
  });

  it('managers cannot create owners or remove owners; employees cannot manage anyone', async () => {
    await expect(as(w.manager, `select public.add_member($1, 'boss@acme.test', 'owner')`, [w.company])).rejects.toThrow(/Only an owner/);
    await expect(as(w.manager, 'select public.remove_member($1, $2)', [w.company, w.owner])).rejects.toThrow(/Only an owner/);
    await expect(as(w.employee, `select public.add_member($1, 'friend@acme.test', 'employee')`, [w.company])).rejects.toThrow(/Only owners and managers/);
    await expect(as(w.employee, 'select public.remove_member($1, $2)', [w.company, w.scopedEmployee])).rejects.toThrow(/Only owners and managers/);
  });

  it('a company always keeps at least one owner', async () => {
    await expect(as(w.owner, 'select public.remove_member($1, $2)', [w.company, w.owner])).rejects.toThrow(/at least one owner/);
  });

  it('members cannot grant themselves access by writing memberships directly', async () => {
    await expect(
      as(w.outsider, `insert into memberships (company_id, user_id, role) values ($1, $2, 'owner')`, [w.company, w.outsider]),
    ).rejects.toThrow(/permission denied/);
    await expect(as(w.employee, `update memberships set role = 'owner' where user_id = $1`, [w.employee])).rejects.toThrow(/permission denied/);
  });

  it('facility-limited managers can only grant access to their facilities', async () => {
    const limited = await user(`limited${seq}@acme.test`);
    await as(w.owner, `select public.add_member($1, $2, 'manager', array[$3]::uuid[])`, [w.company, `limited${seq}@acme.test`, w.facilityB]);
    await expect(as(limited, `select public.add_member($1, 'x@acme.test', 'employee')`, [w.company])).rejects.toThrow(/facilities you manage/);
    await as(limited, `select public.add_member($1, 'y@acme.test', 'employee', array[$2]::uuid[])`, [w.company, w.facilityB]);
    expect(await as(limited, 'select * from maps where id = $1', [w.map])).toEqual([]);
  });

  it('records administrative actions in an audit log only managers can read', async () => {
    await as(w.manager, 'select public.publish_map($1)', [w.map]);
    await as(w.manager, 'select public.remove_member($1, $2)', [w.company, w.scopedEmployee]);
    const log = await as<{ action: string }>(w.owner, 'select action from audit_log where company_id = $1 order by id', [w.company]);
    expect(log.map((l) => l.action)).toEqual(
      expect.arrayContaining(['company.created', 'member.added', 'map.published', 'member.removed']),
    );
    expect(await as(w.employee, 'select * from audit_log')).toEqual([]);
    await expect(as(w.owner, `insert into audit_log (company_id, action) values ($1, 'fake')`, [w.company])).rejects.toThrow(/permission denied/);
  });
});

describe('saving and conflicts', () => {
  it('a save based on an old revision changes nothing, so it can be reported as a conflict', async () => {
    const [{ revision }] = await as<{ revision: number }>(w.manager, 'select revision from maps where id = $1', [w.map]);
    const first = await as<{ revision: number }>(w.manager, 'update maps set draft = $1 where id = $2 and revision = $3 returning revision', [doc('a'), w.map, revision]);
    expect(first[0].revision).toBe(revision + 1);
    const stale = await as(w.owner, 'update maps set draft = $1 where id = $2 and revision = $3 returning revision', [doc('b'), w.map, revision]);
    expect(stale).toEqual([]);
    const [cur] = await as<{ draft: { name: string } }>(w.manager, 'select draft from maps where id = $1', [w.map]);
    expect(cur.draft.name).toBe('a');
  });

  it('clients cannot forge revision numbers or authorship', async () => {
    const [r] = await as<{ revision: number; updated_by: string }>(
      w.manager, 'update maps set draft = $1, revision = 999, updated_by = $2 where id = $3 returning revision, updated_by', [doc('x'), w.owner, w.map],
    );
    expect(r.revision).toBe(2);
    expect(r.updated_by).toBe(w.manager);
  });

  it('version history records who saved each version', async () => {
    await as(w.manager, `insert into map_versions (map_id, reason, label, revision, doc) values ($1, 'manual', 'Before restripe', 1, $2)`, [w.map, doc('v1')]);
    const [v] = await as<{ created_by: string }>(w.owner, 'select created_by from map_versions where map_id = $1', [w.map]);
    expect(v.created_by).toBe(w.manager);
    expect(await as(w.employee, 'select * from map_versions')).toEqual([]);
    await expect(
      as(w.manager, `insert into map_versions (map_id, reason, label, revision, doc, created_by) values ($1, 'manual', 'x', 1, '{}', $2)`, [w.map, w.owner]),
    ).rejects.toThrow(/row-level security/);
  });
});

describe('sites: join codes and contract limits', () => {
  it('a 6-character join code adds an employee to exactly that site', async () => {
    const newbie = await user(`newbie${seq}@gmail.test`);
    await as(w.manager, 'select public.publish_map($1)', [w.map]);
    const [{ get_join_code: code }] = await as<{ get_join_code: string }>(w.manager, 'select public.get_join_code($1)', [w.facilityA]);
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    await as(newbie, 'select public.join_site($1)', [code.toLowerCase()]);
    expect(await as(newbie, 'select map_id from published_maps')).toHaveLength(1);
    expect((await as(newbie, 'select id from facilities')).map((r) => r.id)).toEqual([w.facilityA]);
    expect(await as(newbie, 'select * from maps')).toEqual([]);
    await expect(as(newbie, 'select public.get_join_code($1)', [w.facilityA])).rejects.toThrow(/Only managers/);
  });

  it('wrong codes are rejected with a plain message, and codes never raise a role', async () => {
    const newbie = await user(`guess${seq}@gmail.test`);
    await expect(as(newbie, `select public.join_site('ZZZZZZ')`)).rejects.toThrow(/didn't match a site/);
    const [{ get_join_code: code }] = await as<{ get_join_code: string }>(w.manager, 'select public.get_join_code($1)', [w.facilityA]);
    await as(w.manager, 'select public.join_site($1)', [code]);
    const [m] = await as<{ role: string; facility_ids: string[] | null }>(w.manager, 'select role, facility_ids from memberships where user_id = $1', [w.manager]);
    expect(m).toEqual({ role: 'manager', facility_ids: null });
  });

  it('rotating a code stops the old one from working', async () => {
    const [{ get_join_code: old }] = await as<{ get_join_code: string }>(w.manager, 'select public.get_join_code($1)', [w.facilityA]);
    const [{ rotate_join_code: fresh }] = await as<{ rotate_join_code: string }>(w.manager, 'select public.rotate_join_code($1)', [w.facilityA]);
    expect(fresh).not.toBe(old);
    const late = await user(`late${seq}@gmail.test`);
    await expect(as(late, 'select public.join_site($1)', [old])).rejects.toThrow(/didn't match/);
    await expect(as(w.manager, `update facilities set join_code = 'AAAAAA' where id = $1`, [w.facilityA])).rejects.toThrow(/New join code/);
  });

  it('enforces the contracted number of sites, which customers cannot change', async () => {
    await db.query('update companies set max_sites = 2 where id = $1', [w.company]);
    await expect(as(w.owner, `insert into facilities (company_id, name) values ($1, 'Third')`, [w.company])).rejects.toThrow(/plan includes 2 site/);
    await expect(as(w.owner, 'update companies set max_sites = 10 where id = $1', [w.company])).rejects.toThrow(/permission denied/);
    await as(w.owner, `update companies set name = 'Acme Valet LLC' where id = $1`, [w.company]);
  });

  it('site managers only manage their own site', async () => {
    const siteMgr = await user(`site${seq}@acme.test`);
    await as(w.owner, `select public.add_member($1, $2, 'manager', array[$3]::uuid[])`, [w.company, `site${seq}@acme.test`, w.facilityB]);
    await expect(as(siteMgr, 'select public.get_join_code($1)', [w.facilityA])).rejects.toThrow(/Only managers/);
    await expect(as(siteMgr, `insert into facilities (company_id, name) values ($1, 'New')`, [w.company])).rejects.toThrow(/row-level security/);
    const [{ id }] = await as<{ id: string }>(siteMgr, `insert into maps (facility_id, name, draft) values ($1, 'Stadium', '{}') returning id`, [w.facilityB]);
    expect(id).toBeTruthy();
  });

describe('platform admins', () => {
  it('only admins can create a company; nobody can read or add admins from the app', async () => {
    await expect(as(w.manager, `select public.create_company('Mine', 'Lot')`)).rejects.toThrow(/Only Bergeron Maps admins/);
    await expect(as(w.manager, `select * from platform_admins`)).rejects.toThrow(/permission denied/);
    await expect(as(w.manager, `insert into platform_admins (email) values ('me@x.test')`)).rejects.toThrow(/permission denied/);
    expect((await as<{ is_platform_admin: boolean }>(w.admin, 'select public.is_platform_admin()'))[0].is_platform_admin).toBe(true);
    expect((await as<{ is_platform_admin: boolean }>(w.owner, 'select public.is_platform_admin()'))[0].is_platform_admin).toBe(false);
    expect((await as<{ is_platform_admin: boolean }>(w.manager, 'select public.is_platform_admin()'))[0].is_platform_admin).toBe(false);
  });

  it('admins see every company, site, map and person, without being a member', async () => {
    const companies = (await as<{ id: string }>(w.admin, 'select id from companies')).map((r) => r.id);
    expect(companies).toEqual(expect.arrayContaining([w.company, w.otherCompany]));
    expect(await as(w.admin, 'select id from maps where id in ($1, $2)', [w.map, w.otherMap])).toHaveLength(2);
    const [{ admin_overview: all }] = await as<{ admin_overview: { id: string; sites: { name: string; maps: number }[]; people: { email: string; pending: boolean }[] }[] }>(
      w.admin, 'select public.admin_overview()');
    const acme = all.find((c) => c.id === w.company)!;
    expect(acme.sites.map((s) => s.name)).toEqual(['Harbor Hotel', 'Stadium Lot']);
    expect(acme.sites[0].maps).toBe(1);
    expect(acme.people.map((p) => p.email)).toContain(`manager${seq}@acme.test`);
    expect(await as(w.admin, 'select * from memberships where user_id = $1', [w.admin])).toEqual([]);
  });

  it('admins can manage any company; nobody else can see the overview', async () => {
    expect((await as<{ add_member: string }>(w.admin, `select public.add_member($1, 'new@rival.test', 'manager')`, [w.otherCompany]))[0].add_member).toBe('invited');
    expect((await as(w.admin, 'select * from public.list_members($1)', [w.otherCompany])).length).toBeGreaterThan(1);
    await as(w.admin, 'select public.publish_map($1)', [w.map]);
    await expect(as(w.owner, 'select public.admin_overview()')).rejects.toThrow(/Only Bergeron Maps admins/);
    await expect(as(null, 'select public.admin_overview()')).rejects.toThrow(/permission denied/);
    expect(await as(w.owner, 'select id from companies where id = $1', [w.otherCompany])).toEqual([]);
  });

  it('employees cannot read join codes from the sites table', async () => {
    await expect(as(w.employee, 'select join_code from facilities')).rejects.toThrow(/permission denied/);
    expect(await as(w.employee, 'select id, name from facilities')).not.toHaveLength(0);
  });
});

describe('custom site links', () => {
  it('sites get a readable link name that only resolves for people with access', async () => {
    const [{ slug }] = await as<{ slug: string }>(w.owner, 'select slug from facilities where id = $1', [w.facilityA]);
    expect(slug).toMatch(/^harbor-hotel(-\d+)?$/);
    const mine = await as<{ id: string }>(w.manager, 'select id, company_id from facilities where slug = $1', [slug]);
    expect(mine.map((r) => r.id)).toEqual([w.facilityA]);
    expect(await as(w.outsider, 'select id from facilities where slug = $1', [slug])).toHaveLength(0);
    await expect(as(null, 'select id from facilities where slug = $1', [slug])).rejects.toThrow(/permission denied/);
  });

  it('owners can rename a link; it is cleaned up and must be unique; employees cannot rename', async () => {
    const custom = `Harbor Valet ${seq}!`;
    const [{ slug }] = await as<{ slug: string }>(w.owner, 'update facilities set slug = $2 where id = $1 returning slug', [w.facilityA, custom]);
    expect(slug).toBe(`harbor-valet-${seq}`);
    await expect(as(w.owner, 'update facilities set slug = $2 where id = $1', [w.facilityB, slug])).rejects.toThrow(/duplicate key/);
    const r = await as(w.employee, 'update facilities set slug = $2 where id = $1 returning id', [w.facilityA, 'hijack']);
    expect(r).toHaveLength(0);
    await expect(as(w.owner, 'update facilities set slug = $2 where id = $1', [w.facilityA, 'team'])).rejects.toThrow(/check constraint/);
  });
});
});
