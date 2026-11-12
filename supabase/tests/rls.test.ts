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
    expect((await as<{ join_site: string | null }>(newbie, `select public.join_site('ZZZZZZ')`))[0].join_site).toBeNull();
    expect(await as(newbie, 'select id from facilities')).toEqual([]);
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
    expect((await as<{ join_site: string | null }>(late, 'select public.join_site($1)', [old]))[0].join_site).toBeNull();
    await expect(as(w.manager, `update facilities set join_code = 'AAAAAA' where id = $1`, [w.facilityA])).rejects.toThrow(/New join code|permission denied/);
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

describe('audit hardening', () => {
  it('site managers cannot shrink or change the access of people beyond their sites', async () => {
    const siteMgr = await user(`sitemgr${seq}@acme.test`);
    await as(w.owner, `select public.add_member($1, $2, 'manager', array[$3]::uuid[])`, [w.company, `sitemgr${seq}@acme.test`, w.facilityB]);
    // w.manager is a company-wide manager; the site manager must not be able to narrow them to one site.
    await expect(as(siteMgr, `select public.add_member($1, $2, 'manager', array[$3]::uuid[])`, [w.company, `manager${seq}@acme.test`, w.facilityB]))
      .rejects.toThrow(/access beyond your sites/);
    const [m] = await as<{ facility_ids: string[] | null }>(w.owner, 'select facility_ids from memberships where user_id = $1', [w.manager]);
    expect(m.facility_ids).toBeNull();
    // ...but can still manage people who are only at their site.
    await as(siteMgr, `select public.add_member($1, $2, 'employee', array[$3]::uuid[])`, [w.company, `scoped${seq}@acme.test`, w.facilityB]);
    // Invitations follow the same rule.
    await as(w.owner, `select public.add_member($1, 'wide${seq}@new.test', 'manager')`, [w.company]);
    await expect(as(siteMgr, `select public.add_member($1, 'wide${seq}@new.test', 'employee', array[$2]::uuid[])`, [w.company, w.facilityB]))
      .rejects.toThrow(/beyond your sites/);
    await expect(as(siteMgr, `select public.cancel_invitation($1, 'wide${seq}@new.test')`, [w.company])).rejects.toThrow(/your own sites/);
  });

  it('site managers only see the people at their own sites', async () => {
    const siteMgr = await user(`sitesee${seq}@acme.test`);
    await as(w.owner, `select public.add_member($1, $2, 'manager', array[$3]::uuid[])`, [w.company, `sitesee${seq}@acme.test`, w.facilityB]);
    const seen = (await as<{ email: string }>(siteMgr, 'select email from public.list_members($1)', [w.company])).map((r) => r.email).sort();
    expect(seen).toEqual([`scoped${seq}@acme.test`, `sitesee${seq}@acme.test`]);
    expect((await as(w.owner, 'select email from public.list_members($1)', [w.company])).length).toBeGreaterThan(3);
  });

  it('join codes cannot be guessed: 10 wrong codes in an hour pause joining', async () => {
    const guesser = await user(`brute${seq}@gmail.test`);
    for (let i = 0; i < 10; i++) await as(guesser, `select public.join_site('QQQQQ' || $1)`, [String(i)]);
    const [{ get_join_code: code }] = await as<{ get_join_code: string }>(w.manager, 'select public.get_join_code($1)', [w.facilityA]);
    await expect(as(guesser, 'select public.join_site($1)', [code])).rejects.toThrow(/Too many wrong codes/);
    await expect(as(guesser, 'select * from join_attempts')).rejects.toThrow(/permission denied/);
  });

  it('map documents have a size limit', async () => {
    const huge = { ...doc('big'), pad: 'x'.repeat(26 * 1024 * 1024) };
    await expect(as(w.manager, `insert into maps (facility_id, name, draft) values ($1, 'Big', $2)`, [w.facilityA, huge])).rejects.toThrow(/maps_draft_size/);
  });
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

  it('an admin email only counts once it is confirmed', async () => {
    const email = `unconfirmed${Date.now()}@bergeronmaps.test`;
    await db.query('insert into platform_admins (email) values ($1)', [email]);
    const id = (await db.query<{ id: string }>('insert into auth.users (email, email_confirmed_at) values ($1, null) returning id', [email])).rows[0].id;
    expect((await as<{ is_platform_admin: boolean }>(id, 'select public.is_platform_admin()'))[0].is_platform_admin).toBe(false);
    await expect(as(id, `select public.create_company('Mine', 'Lot')`)).rejects.toThrow(/Only Bergeron Maps admins/);
    await db.query('update auth.users set email_confirmed_at = now() where id = $1', [id]);
    expect((await as<{ is_platform_admin: boolean }>(id, 'select public.is_platform_admin()'))[0].is_platform_admin).toBe(true);
    await db.query('delete from platform_admins where email = $1', [email]);
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

describe('map slots and live maps per site', () => {
  const newMap = (site: string, name: string, slot?: number) =>
    as<{ id: string; slot: number }>(w.manager, 'insert into maps (facility_id, name, draft, slot) values ($1, $2, $3, $4) returning id, slot', [site, name, doc(name), slot ?? null]);

  it('a site holds at most 5 maps, each in its own numbered slot', async () => {
    const [{ slot: first }] = await as<{ slot: number }>(w.manager, 'select slot from maps where id = $1', [w.map]);
    expect(first).toBe(1);
    const slots = [];
    for (let i = 2; i <= 5; i++) slots.push((await newMap(w.facilityA, `Map ${i}`))[0].slot);
    expect(slots).toEqual([2, 3, 4, 5]);
    await expect(newMap(w.facilityA, 'Sixth')).rejects.toThrow(/All 5 map slots at “Harbor Hotel” are in use/);
    // Other sites are not affected.
    expect((await newMap(w.facilityB, 'Lot'))[0].slot).toBe(1);
  });

  it('the trash frees a slot, and restoring needs a free one', async () => {
    for (let i = 2; i <= 5; i++) await newMap(w.facilityA, `Map ${i}`);
    await as(w.manager, 'update maps set deleted_at = now() where id = $1', [w.map]);
    const [{ slot }] = await newMap(w.facilityA, 'Replacement');
    expect(slot).toBe(1);
    await expect(as(w.manager, 'update maps set deleted_at = null where id = $1', [w.map])).rejects.toThrow(/All 5 map slots/);
  });

  it('moving a map into a full site is refused; clients cannot pick slots on existing maps', async () => {
    for (let i = 2; i <= 5; i++) await newMap(w.facilityA, `Map ${i}`);
    const [{ id }] = await newMap(w.facilityB, 'Lot');
    await expect(as(w.manager, 'update maps set facility_id = $1 where id = $2', [w.facilityA, id])).rejects.toThrow(/All 5 map slots/);
    await as(w.manager, 'update maps set slot = 4 where id = $1', [id]);
    expect((await as<{ slot: number }>(w.manager, 'select slot from maps where id = $1', [id]))[0].slot).toBe(1);
  });

  it('a new map may ask for a free slot', async () => {
    expect((await newMap(w.facilityA, 'Fourth', 4))[0].slot).toBe(4);
    expect((await newMap(w.facilityA, 'Taken', 4))[0].slot).toBe(2);
  });

  it('at most 2 maps per site are live; unpublishing frees a place', async () => {
    const [{ id: b }] = await newMap(w.facilityA, 'B');
    const [{ id: c }] = await newMap(w.facilityA, 'C');
    await as(w.manager, 'select public.publish_map($1)', [w.map]);
    await as(w.manager, 'select public.publish_map($1)', [b]);
    await as(w.manager, 'select public.publish_map($1)', [b]); // republishing a live map is fine
    await expect(as(w.manager, 'select public.publish_map($1)', [c])).rejects.toThrow(/already has 2 live maps/);

    await expect(as(w.employee, 'select public.unpublish_map($1)', [b])).rejects.toThrow(/permission/);
    await as(w.manager, 'select public.unpublish_map($1)', [b]);
    expect((await as(w.employee, 'select map_id from published_maps')).map((r) => r.map_id)).toEqual([w.map]);
    await as(w.manager, 'select public.publish_map($1)', [c]);

    // A live map in the trash doesn't count, but can't come back while 2 others are live.
    await as(w.manager, 'update maps set deleted_at = now() where id = $1', [c]);
    await as(w.manager, 'select public.publish_map($1)', [b]);
    await expect(as(w.manager, 'update maps set deleted_at = null where id = $1', [c])).rejects.toThrow(/already has 2 live maps/);
    const [{ id: d }] = await newMap(w.facilityB, 'D');
    await as(w.manager, 'select public.publish_map($1)', [d]);
    await expect(as(w.manager, 'update maps set facility_id = $1 where id = $2', [w.facilityA, d])).rejects.toThrow(/already has 2 live maps/);
  });
});

describe('third audit (2026-11-10)', () => {
  const codeOf = async (facility: string) =>
    (await as<{ get_join_code: string }>(w.owner, 'select public.get_join_code($1)', [facility]))[0].get_join_code;

  it('a site manager cannot use an employee join code to manage another site', async () => {
    const siteMgr = await user(`site${seq}@acme.test`);
    await as(w.owner, `select public.add_member($1, $2, 'manager', array[$3]::uuid[])`, [w.company, `site${seq}@acme.test`, w.facilityB]);
    await expect(as(siteMgr, 'select public.join_site($1)', [await codeOf(w.facilityA)])).rejects.toThrow(/already manage/);
    expect(await as(siteMgr, 'select public.can_edit_facility($1) ok', [w.facilityA])).toEqual([{ ok: false }]);
    // Employees still join extra sites with a code, as before.
    expect((await as<{ join_site: string }>(w.scopedEmployee, 'select public.join_site($1)', [await codeOf(w.facilityA)]))[0].join_site).toBe(w.facilityA);
  });

  it('the last owner cannot demote themselves and leave a company without an owner', async () => {
    await expect(as(w.owner, `select public.add_member($1, $2, 'manager')`, [w.company, `owner${seq}@acme.test`])).rejects.toThrow(/at least one owner/);
    const second = await user(`owner2-${seq}@acme.test`);
    await as(w.owner, `select public.add_member($1, $2, 'owner')`, [w.company, `owner2-${seq}@acme.test`]);
    await as(second, `select public.add_member($1, $2, 'manager')`, [w.company, `owner${seq}@acme.test`]);
  });

  it('a live map moved to another site is shown to that site, not the old one', async () => {
    await as(w.manager, 'select public.publish_map($1)', [w.map]);
    await as(w.manager, 'update maps set facility_id = $1 where id = $2', [w.facilityB, w.map]);
    const [p] = await as<{ facility_id: string }>(w.manager, 'select facility_id from published_maps where map_id = $1', [w.map]);
    expect(p.facility_id).toBe(w.facilityB);
    expect(await as(w.scopedEmployee, 'select map_id from published_maps where map_id = $1', [w.map])).toHaveLength(1);
  });

  it('sites cannot be moved to another company or renumbered from the app', async () => {
    await expect(as(w.owner, 'update facilities set company_id = $1 where id = $2', [w.otherCompany, w.facilityA])).rejects.toThrow(/permission denied/);
    await as(w.owner, `update facilities set slug = 'harbor' where id = $1`, [w.facilityA]);
  });

  it('nothing is callable or writable by a visitor who is not signed in, beyond the public map link', async () => {
    const fns = await db.query<{ proname: string }>(`
      select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prorettype <> 'trigger'::regtype and has_function_privilege('anon', p.oid, 'execute')
      order by 1`);
    expect(fns.rows.map((r) => r.proname)).toEqual(['get_public_map']);
  });

  it('signed-in people hold no write privileges on tables they may only read', async () => {
    const r = await db.query<{ t: string; p: string }>(`
      select t, p from unnest(array['companies','memberships','invitations','published_maps','audit_log','map_versions']) t,
        unnest(array['INSERT','UPDATE','DELETE','TRUNCATE']) p
      where has_table_privilege('authenticated', 'public.' || t, p)
        and not (t = 'map_versions' and p = 'INSERT')`);
    // companies keeps its column-level rename right only
    expect(r.rows).toEqual([]);
  });

  it('password sign-ins are refused by the access token hook; email links are not', async () => {
    const hook = (amr: unknown) =>
      db.query<{ r: { error?: { http_code: number } } }>('select public.block_password_sign_in($1::jsonb) r', [JSON.stringify({ claims: { sub: w.owner, amr } })]);
    expect((await hook([{ method: 'password', timestamp: 1 }])).rows[0].r.error?.http_code).toBe(403);
    const ok = (await hook([{ method: 'otp', timestamp: 1 }])).rows[0].r;
    expect(ok.error).toBeUndefined();
    expect((ok as unknown as { claims: { sub: string } }).claims.sub).toBe(w.owner);
  });
});

describe('protecting sites that have maps', () => {
  it('a site with maps (even trashed ones) cannot be deleted; an empty one can; deleting a company still works', async () => {
    await expect(as(w.owner, 'delete from facilities where id = $1', [w.facilityA])).rejects.toThrow(/still has maps/);
    const [{ id: lot }] = await as<{ id: string }>(w.owner, `insert into facilities (company_id, name) values ($1, 'Spare Lot') returning id`, [w.company]);
    const [{ id: m }] = await as<{ id: string }>(w.owner, `insert into maps (facility_id, name, draft) values ($1, 'Spare', $2) returning id`, [lot, doc('s')]);
    await as(w.owner, 'update maps set deleted_at = now() where id = $1', [m]);
    await expect(as(w.owner, 'delete from facilities where id = $1', [lot])).rejects.toThrow(/still has maps/);
    await as(w.owner, 'delete from maps where id = $1', [m]);
    expect(await as(w.owner, 'delete from facilities where id = $1 returning id', [lot])).toHaveLength(1);

    const c = (await db.query<{ id: string }>(`insert into companies (name) values ('Gone Co') returning id`)).rows[0].id;
    const f = (await db.query<{ id: string }>(`insert into facilities (company_id, name) values ($1, 'Gone Lot') returning id`, [c])).rows[0].id;
    await db.query(`insert into maps (facility_id, name, draft) values ($1, 'Gone', '{}')`, [f]);
    await db.query('delete from companies where id = $1', [c]);
    expect((await db.query('select 1 from facilities where id = $1', [f])).rows).toHaveLength(0);
  });
});

