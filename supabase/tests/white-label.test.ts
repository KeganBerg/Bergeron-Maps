/**
 * White-label roles and site workflow (migration 20261112010000): contract
 * setup by admins, manager requests, transfers, sign-out on removal,
 * My Locations and public site links.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const ADMIN_URL = process.env.DATABASE_URL;
if (!ADMIN_URL) throw new Error('Set DATABASE_URL to a Postgres server to run the database tests (see README).');

const dbName = `bm_wl_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
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
  // Stand-in for Supabase's sign-in sessions table.
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

const doc = (name: string) => ({ id: 'local', name, floors: [], schemaVersion: 1 });

let seq = 0;
let w: {
  staff: string; lead: string; regional: string; siteManager: string; employee: string; outsider: string;
  company: string; siteA: string; siteB: string; siteC: string; slugA: string; leadEmail: string; employeeEmail: string; managerEmail: string;
};

beforeEach(async () => {
  seq++;
  const staff = await user(`staff${seq}@bergeronmaps.test`);
  await db.query('insert into platform_admins (email) values ($1)', [`staff${seq}@bergeronmaps.test`]);
  const leadEmail = `lead${seq}@company.test`;
  const lead = await user(leadEmail);
  const regional = await user(`regional${seq}@company.test`);
  const managerEmail = `sitemgr${seq}@company.test`;
  const siteManager = await user(managerEmail);
  const employeeEmail = `valet${seq}@personal.test`;
  const employee = await user(employeeEmail);
  const outsider = await user(`outsider${seq}@other.test`);

  const [{ setup_company: company }] = await as<{ setup_company: string }>(staff,
    `select public.setup_company('Company ${seq}', 'Site A', '100 Main St', $1, 3)`, [leadEmail]);
  const [{ id: siteA, slug: slugA }] = await as<{ id: string; slug: string }>(staff, 'select id, slug from facilities where company_id = $1', [company]);
  const [{ add_contract_site: siteB }] = await as<{ add_contract_site: string }>(staff, `select public.add_contract_site($1, 'Site B', '200 Main St')`, [company]);
  const [{ add_contract_site: siteC }] = await as<{ add_contract_site: string }>(staff, `select public.add_contract_site($1, 'Site C', '300 Main St')`, [company]);
  await as(lead, `select public.add_member($1, $2, 'manager')`, [company, `regional${seq}@company.test`]);
  await as(lead, `select public.add_member($1, $2, 'manager', array[$3]::uuid[])`, [company, managerEmail, siteA]);
  const [{ join_code: code }] = await db.query<{ join_code: string }>('select join_code from facilities where id = $1', [siteA]).then((r) => r.rows);
  await as(employee, 'select public.join_site($1)', [code]);

  w = { staff, lead, regional, siteManager, employee, outsider, company, siteA, siteB, siteC, slugA, leadEmail, employeeEmail, managerEmail };
});

describe('contract setup', () => {
  it('sets up a company with its account lead as owner, the site limit and addresses; the admin is not a member', async () => {
    const members = await as<{ email: string; role: string }>(w.lead, 'select email, role from public.list_members($1)', [w.company]);
    expect(members.find((m) => m.email === w.leadEmail)?.role).toBe('owner');
    expect((await db.query('select 1 from memberships where company_id = $1 and user_id = $2', [w.company, w.staff])).rowCount).toBe(0);
    const [c] = (await db.query('select max_sites from companies where id = $1', [w.company])).rows;
    expect(c.max_sites).toBe(3);
    const sites = (await db.query('select name, address from facilities where company_id = $1 order by name', [w.company])).rows;
    expect(sites.map((s) => s.address)).toEqual(['100 Main St', '200 Main St', '300 Main St']);
  });

  it('an account lead who has not signed up yet is invited as owner', async () => {
    const [{ setup_company: c }] = await as<{ setup_company: string }>(w.staff, `select public.setup_company('New Co', 'Lot', null, 'Future@Company.test', 1)`);
    const inv = (await db.query('select email, role from invitations where company_id = $1', [c])).rows;
    expect(inv).toEqual([{ email: 'future@company.test', role: 'owner' }]);
  });

  it('the site limit holds, even for the account lead and regional managers', async () => {
    await expect(as(w.lead, `insert into facilities (company_id, name) values ($1, 'Extra')`, [w.company])).rejects.toThrow(/includes 3 site/);
    await expect(as(w.staff, `select public.add_contract_site($1, 'Extra', '400 Main St')`, [w.company])).rejects.toThrow(/includes 3 site/);
    await as(w.staff, 'select public.set_site_limit($1, 4)', [w.company]);
    await as(w.staff, `select public.add_contract_site($1, 'Site D', '400 Main St')`, [w.company]);
    await expect(as(w.staff, 'select public.set_site_limit($1, 2)', [w.company])).rejects.toThrow(/already has 4 sites/);
  });

  it('only admins change the limit and addresses, or set up companies', async () => {
    await expect(as(w.lead, 'select public.set_site_limit($1, 50)', [w.company])).rejects.toThrow(/Only Bergeron Maps admins/);
    await expect(as(w.lead, `select public.set_site_address($1, 'Somewhere else')`, [w.siteA])).rejects.toThrow(/contract/);
    await expect(as(w.lead, `update facilities set address = 'Somewhere else' where id = $1`, [w.siteA])).rejects.toThrow(/contract/);
    await expect(as(w.lead, `select public.add_contract_site($1, 'X', 'Y')`, [w.company])).rejects.toThrow(/Only Bergeron Maps admins/);
    await expect(as(w.lead, `select public.setup_company('X', 'Y')`)).rejects.toThrow(/Only Bergeron Maps admins/);
    // Renaming a site is still fine for the account lead.
    expect(await as(w.lead, `update facilities set name = 'Site A North' where id = $1 returning id`, [w.siteA])).toHaveLength(1);
    await as(w.staff, `select public.set_site_address($1, '101 Main St')`, [w.siteA]);
    expect((await db.query('select address from facilities where id = $1', [w.siteA])).rows[0].address).toBe('101 Main St');
  });

  it('the overview shows the limit, addresses and open manager requests', async () => {
    await as(w.employee, 'select public.request_manager_access($1)', [w.siteA]);
    const [{ admin_overview: all }] = await as<{ admin_overview: { id: string; max_sites: number; sites: { address: string }[]; requests: { email: string }[] }[] }>(
      w.staff, 'select public.admin_overview()');
    const c = all.find((x) => x.id === w.company)!;
    expect(c.max_sites).toBe(3);
    expect(c.sites[0].address).toBe('100 Main St');
    expect(c.requests.map((r) => r.email)).toEqual([w.employeeEmail]);
  });
});

describe('Request Manager Status', () => {
  it('an employee asks; the regional manager approves in one step; they manage only that site', async () => {
    const [{ request_manager_access: id }] = await as<{ request_manager_access: string }>(w.employee, `select public.request_manager_access($1, 'New lead here')`, [w.siteA]);
    // Asking twice keeps one request.
    await as(w.employee, 'select public.request_manager_access($1)', [w.siteA]);
    expect(await as(w.employee, 'select id, status from manager_requests')).toEqual([{ id, status: 'pending' }]);
    expect(await as(w.regional, 'select id from manager_requests where status = $1', ['pending'])).toEqual([{ id }]);
    await as(w.regional, 'select public.decide_manager_request($1, true)', [id]);
    const [m] = (await db.query('select role, facility_ids from memberships where user_id = $1', [w.employee])).rows;
    expect(m).toEqual({ role: 'manager', facility_ids: [w.siteA] });
    await expect(as(w.regional, 'select public.decide_manager_request($1, false)', [id])).rejects.toThrow(/already answered/);
  });

  it('deny changes nothing', async () => {
    const [{ request_manager_access: id }] = await as<{ request_manager_access: string }>(w.employee, 'select public.request_manager_access($1)', [w.siteA]);
    await as(w.lead, 'select public.decide_manager_request($1, false)', [id]);
    const [m] = (await db.query('select role from memberships where user_id = $1', [w.employee])).rows;
    expect(m.role).toBe('employee');
  });

  it('nobody can approve their own request; site managers and outsiders cannot answer', async () => {
    const [{ request_manager_access: id }] = await as<{ request_manager_access: string }>(w.employee, 'select public.request_manager_access($1)', [w.siteA]);
    await expect(as(w.employee, 'select public.decide_manager_request($1, true)', [id])).rejects.toThrow(/Only owners and regional managers/);
    await expect(as(w.siteManager, 'select public.decide_manager_request($1, true)', [id])).rejects.toThrow(/Only owners and regional managers/);
    await expect(as(w.outsider, 'select public.decide_manager_request($1, true)', [id])).rejects.toThrow(/Only owners and regional managers/);
    expect(await as(w.outsider, 'select * from manager_requests')).toEqual([]);
    expect(await as(w.siteManager, 'select * from manager_requests')).toEqual([]);
    await expect(as(w.employee, `update manager_requests set status = 'approved'`)).rejects.toThrow(/permission denied/);
    await expect(as(w.employee, `insert into manager_requests (company_id, facility_id, user_id, email) values ($1, $2, $3, 'x')`,
      [w.company, w.siteA, w.employee])).rejects.toThrow(/permission denied/);
  });

  it('only for sites the person has joined, and at most 3 open requests', async () => {
    await expect(as(w.outsider, 'select public.request_manager_access($1)', [w.siteA])).rejects.toThrow(/Join this site/);
    await expect(as(w.employee, 'select public.request_manager_access($1)', [w.siteB])).rejects.toThrow(/Join this site/);
    await expect(as(w.siteManager, 'select public.request_manager_access($1)', [w.siteA])).rejects.toThrow(/already manage/);
    await expect(as(null, 'select public.request_manager_access($1)', [w.siteA])).rejects.toThrow(/permission denied/);
  });

  it('a site manager approved for a second site manages both', async () => {
    const code = (await db.query('select join_code from facilities where id = $1', [w.siteB])).rows[0].join_code;
    // Managers can't add a site with a code (third audit), so the lead gives employee access elsewhere first.
    await expect(as(w.siteManager, 'select public.join_site($1)', [code])).rejects.toThrow(/already manage/);
    await db.query('insert into manager_requests (company_id, facility_id, user_id, email) values ($1, $2, $3, $4)', [w.company, w.siteB, w.siteManager, w.managerEmail]);
    const [{ id }] = (await db.query('select id from manager_requests where user_id = $1', [w.siteManager])).rows;
    await as(w.lead, 'select public.decide_manager_request($1, true)', [id]);
    const [m] = (await db.query('select role, facility_ids from memberships where user_id = $1', [w.siteManager])).rows;
    expect(m.role).toBe('manager');
    expect([...m.facility_ids].sort()).toEqual([w.siteA, w.siteB].sort());
  });
});

describe('transfers and removal', () => {
  it('a regional manager moves a site manager to another site; their maps stay with the site', async () => {
    const [{ id: map }] = await as<{ id: string }>(w.siteManager, `insert into maps (facility_id, name, draft) values ($1, 'Garage', $2) returning id`, [w.siteA, doc('v1')]);
    await as(w.regional, 'select public.move_member($1, $2, $3, $4)', [w.company, w.managerEmail, w.siteA, w.siteB]);
    const [m] = (await db.query('select role, facility_ids from memberships where user_id = $1', [w.siteManager])).rows;
    expect(m).toEqual({ role: 'manager', facility_ids: [w.siteB] });
    expect(await as(w.siteManager, 'select id from maps where id = $1', [map])).toEqual([]);
    expect(await as(w.regional, 'select facility_id from maps where id = $1', [map])).toEqual([{ facility_id: w.siteA }]);
  });

  it('moves invitations too; site managers cannot move people', async () => {
    await as(w.lead, `select public.add_member($1, 'later@company.test', 'manager', array[$2]::uuid[])`, [w.company, w.siteA]);
    await as(w.lead, `select public.move_member($1, 'later@company.test', $2, $3)`, [w.company, w.siteA, w.siteC]);
    expect((await db.query(`select facility_ids from invitations where email = 'later@company.test'`)).rows[0].facility_ids).toEqual([w.siteC]);
    await expect(as(w.siteManager, 'select public.move_member($1, $2, $3, $4)', [w.company, w.employeeEmail, w.siteA, w.siteB]))
      .rejects.toThrow(/Only owners and regional managers/);
    await expect(as(w.lead, 'select public.move_member($1, $2, $3, $4)', [w.company, w.employeeEmail, w.siteB, w.siteC])).rejects.toThrow(/isn't at that site/);
  });

  it('removing someone signs them out everywhere and cancels their requests', async () => {
    await db.query('insert into auth.sessions (user_id) values ($1), ($1), ($2)', [w.siteManager, w.lead]);
    await as(w.employee, 'select public.request_manager_access($1)', [w.siteA]);
    await as(w.regional, 'select public.remove_member($1, $2)', [w.company, w.siteManager]);
    await as(w.regional, 'select public.remove_member($1, $2)', [w.company, w.employee]);
    expect((await db.query('select user_id from auth.sessions')).rows).toEqual([{ user_id: w.lead }]);
    expect((await db.query('select status from manager_requests where user_id = $1', [w.employee])).rows).toEqual([{ status: 'denied' }]);
    expect(await as(w.siteManager, 'select id from facilities')).toEqual([]);
  });
});

describe('My Locations and public site links', () => {
  it('lists every joined site across companies, and employees can leave one', async () => {
    const [{ setup_company: other }] = await as<{ setup_company: string }>(w.staff, `select public.setup_company('Other Co', 'Lot 9', '9 Elm St')`);
    const code = (await db.query('select join_code from facilities where company_id = $1', [other])).rows[0].join_code;
    await as(w.employee, 'select public.join_site($1)', [code]);
    const mine = await as<{ company_name: string; site_name: string; role: string; address: string | null }>(w.employee,
      'select company_name, site_name, role, address from public.my_locations()');
    // Ordered by company name: "Company N" before "Other Co".
    expect(mine.map((r) => r.site_name)).toEqual(['Site A', 'Lot 9']);
    expect(mine.every((r) => r.role === 'employee')).toBe(true);
    const [lot] = (await db.query('select id from facilities where company_id = $1', [other])).rows;
    await as(w.employee, 'select public.leave_site($1)', [lot.id]);
    expect((await as<{ site_name: string }>(w.employee, 'select site_name from public.my_locations()')).map((r) => r.site_name)).toEqual(['Site A']);
    await expect(as(w.siteManager, 'select public.leave_site($1)', [w.siteA])).rejects.toThrow(/Managers can't leave/);
  });

  it('a site link shows only its public, live, published maps, with no sign-in', async () => {
    const [{ id: pub }] = await as<{ id: string }>(w.siteManager, `insert into maps (facility_id, name, draft) values ($1, 'Visitor map', $2) returning id`, [w.siteA, doc('v1')]);
    const [{ id: priv }] = await as<{ id: string }>(w.siteManager, `insert into maps (facility_id, name, draft) values ($1, 'Staff map', $2) returning id`, [w.siteA, doc('staff')]);
    await as(w.siteManager, 'select public.publish_map($1)', [pub]);
    await as(w.siteManager, 'select public.publish_map($1)', [priv]);
    expect(await as(null, 'select * from public.get_public_site($1)', [w.slugA])).toEqual([]);
    await as(w.siteManager, 'update maps set is_public = true, draft = $1 where id = $2', [doc('unpublished draft'), pub]);
    const rows = await as<{ map_id: string; site_name: string; doc: { name: string } }>(null, 'select * from public.get_public_site($1)', [w.slugA.toUpperCase()]);
    expect(rows.map((r) => [r.map_id, r.site_name, r.doc.name])).toEqual([[pub, 'Site A', 'v1']]);
    await as(w.siteManager, 'update maps set deleted_at = now() where id = $1', [pub]);
    expect(await as(null, 'select * from public.get_public_site($1)', [w.slugA])).toEqual([]);
    expect(await as(null, 'select * from public.get_public_site($1)', ['no-such-site'])).toEqual([]);
  });

  it('visitors who are not signed in can call nothing new except the public site link', async () => {
    for (const sql of ['select public.my_locations()', `select public.setup_company('x', 'y')`, 'select public.leave_site(gen_random_uuid())',
      'select public.decide_manager_request(gen_random_uuid(), true)', 'select public.end_sessions(gen_random_uuid())']) {
      await expect(as(null, sql)).rejects.toThrow(/permission denied/);
    }
    await expect(as(w.lead, 'select public.end_sessions($1)', [w.employee])).rejects.toThrow(/permission denied/);
  });
});

describe('deleting from All accounts', () => {
  it('admins delete an empty site; a site with maps is refused; access to a deleted site is taken away', async () => {
    await as(w.lead, `select public.add_member($1, 'cmgr@company.test', 'manager', array[$2]::uuid[])`, [w.company, w.siteC]);
    const cm = await user(`c-only${seq}@company.test`);
    await as(w.lead, `select public.add_member($1, $2, 'employee', array[$3, $4]::uuid[])`, [w.company, `c-only${seq}@company.test`, w.siteB, w.siteC]);
    const [{ id: map }] = await as<{ id: string }>(w.lead, `insert into maps (facility_id, name, draft) values ($1, 'Old', $2) returning id`, [w.siteC, doc('x')]);
    await as(w.lead, 'update maps set deleted_at = now() where id = $1', [map]);
    await expect(as(w.staff, 'select public.admin_delete_site($1)', [w.siteC])).rejects.toThrow(/still has 1 map/);
    await db.query('delete from maps where id = $1', [map]);
    await expect(as(w.lead, 'select public.admin_delete_site($1)', [w.siteC])).rejects.toThrow(/Only Bergeron Maps admins/);
    await as(w.staff, 'select public.admin_delete_site($1)', [w.siteC]);
    expect((await db.query('select facility_ids from memberships where user_id = $1', [cm])).rows[0].facility_ids).toEqual([w.siteB]);
    expect((await db.query(`select 1 from invitations where email = 'cmgr@company.test'`)).rowCount).toBe(0);
  });

  it('a whole company is deleted only by an admin who types its name; its people are signed out', async () => {
    await db.query('insert into auth.sessions (user_id) values ($1), ($2)', [w.employee, w.staff]);
    await as(w.lead, `insert into maps (facility_id, name, draft) values ($1, 'Garage', $2)`, [w.siteA, doc('x')]);
    await expect(as(w.lead, 'select public.admin_delete_company($1, $2)', [w.company, `Company ${seq}`])).rejects.toThrow(/Only Bergeron Maps admins/);
    await expect(as(w.staff, 'select public.admin_delete_company($1, $2)', [w.company, 'company'])).rejects.toThrow(/Type the company name/);
    await as(w.staff, 'select public.admin_delete_company($1, $2)', [w.company, `Company ${seq}`]);
    expect((await db.query('select 1 from companies where id = $1', [w.company])).rowCount).toBe(0);
    expect((await db.query('select 1 from facilities where company_id = $1', [w.company])).rowCount).toBe(0);
    expect((await db.query('select user_id from auth.sessions where user_id = any($1)', [[w.employee, w.staff]])).rows).toEqual([{ user_id: w.staff }]);
    expect((await db.query(`select 1 from audit_log where action = 'company.deleted' and target = $1`, [w.company])).rowCount).toBe(1);
  });

  it('nobody can remove themselves, so an admin or lead cannot lock themselves out', async () => {
    await expect(as(w.lead, 'select public.remove_member($1, $2)', [w.company, w.lead])).rejects.toThrow(/at least one owner/);
    await as(w.lead, `select public.add_member($1, $2, 'owner')`, [w.company, `regional${seq}@company.test`]);
    await expect(as(w.lead, 'select public.remove_member($1, $2)', [w.company, w.lead])).rejects.toThrow(/can't remove yourself/);
    await expect(as(w.regional, 'select public.remove_member($1, $2)', [w.company, w.regional])).rejects.toThrow(/can't remove yourself/);
  });
});
