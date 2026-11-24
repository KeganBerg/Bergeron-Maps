/**
 * Fourth access audit (2026-11-19): accounts, roles and sharing.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const ADMIN_URL = process.env.DATABASE_URL;
if (!ADMIN_URL) throw new Error('Set DATABASE_URL to a Postgres server to run the database tests (see README).');

const dbName = `bm_acct_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
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


const code = async (site: string) => (await db.query<{ join_code: string }>('select join_code from facilities where id = $1', [site])).rows[0].join_code;
const fails = async (p: Promise<unknown>, re: RegExp) => { await expect(p).rejects.toThrow(re); };

const ids = async (who: string) =>
  (await db.query<{ facility_ids: string[] | null; role: string }>('select role, facility_ids from memberships where user_id = $1', [who])).rows[0];

describe('admins who also belong to a company', () => {
  it('keep every admin power there after joining one of its sites with a code', async () => {
    // Before the fix the code made the admin an employee, and Sites & people then refused them.
    await db.query(`insert into memberships (company_id, user_id, role, facility_ids) values ($1, $2, 'employee', array[$3]::uuid[])`, [w.company, w.staff, w.siteB]);
    expect((await as(w.staff, 'select * from public.list_members($1)', [w.company])).length).toBeGreaterThan(3);
    await as(w.staff, `select public.add_member($1, $2, 'manager', array[$3]::uuid[])`, [w.company, `new${seq}@company.test`, w.siteA]);
    await as(w.staff, 'select public.remove_member($1, $2)', [w.company, w.employee]);
    expect(await ids(w.employee)).toBeUndefined();
    await as(w.staff, 'select public.cancel_invitation($1, $2)', [w.company, `new${seq}@company.test`]);
  });

  it('are told they already have every site when they type a site code, and nothing changes', async () => {
    await fails(as(w.staff, 'select public.join_site($1)', [await code(w.siteB)]), /already have every site/);
    expect((await db.query('select 1 from memberships where user_id = $1', [w.staff])).rows).toHaveLength(0);
    // A wrong code is still counted as a wrong try.
    expect(await as(w.staff, `select public.join_site('ZZZZZZ') as id`)).toEqual([{ id: null }]);
  });
});

describe('site managers removing an employee who works at other sites too', () => {
  beforeEach(async () => {
    await as(w.lead, `select public.add_member($1, $2, 'employee', array[$3, $4]::uuid[])`, [w.company, w.employeeEmail, w.siteA, w.siteB]);
  });

  it('takes away only the manager’s own sites; the employee keeps the rest and stays signed in', async () => {
    await db.query('insert into auth.sessions (user_id) values ($1)', [w.employee]);
    await as(w.siteManager, 'select public.remove_member($1, $2)', [w.company, w.employee]);
    expect(await ids(w.employee)).toEqual({ role: 'employee', facility_ids: [w.siteB] });
    expect((await db.query('select 1 from auth.sessions where user_id = $1', [w.employee])).rows).toHaveLength(1);
    // Their maps at site A are gone for them; site B's are still there.
    expect(await as(w.employee, 'select public.can_view_facility($1) as a, public.can_view_facility($2) as b', [w.siteA, w.siteB])).toEqual([{ a: false, b: true }]);
    const [log] = await db.query<{ action: string }>(`select action from audit_log where company_id = $1 order by id desc limit 1`, [w.company]).then((r) => r.rows);
    expect(log.action).toBe('member.removed_from_sites');
  });

  it('cancels their manager request for that site only', async () => {
    await as(w.employee, 'select public.request_manager_access($1)', [w.siteA]);
    await as(w.employee, 'select public.request_manager_access($1)', [w.siteB]);
    await as(w.siteManager, 'select public.remove_member($1, $2)', [w.company, w.employee]);
    const rows = (await db.query<{ facility_id: string; status: string }>('select facility_id, status from manager_requests where user_id = $1', [w.employee])).rows;
    expect(rows.find((r) => r.facility_id === w.siteA)?.status).toBe('denied');
    expect(rows.find((r) => r.facility_id === w.siteB)?.status).toBe('pending');
  });

  it('still removes them completely when the manager’s sites are all they have', async () => {
    await as(w.lead, `select public.add_member($1, $2, 'employee', array[$3]::uuid[])`, [w.company, w.employeeEmail, w.siteA]);
    await as(w.siteManager, 'select public.remove_member($1, $2)', [w.company, w.employee]);
    expect(await ids(w.employee)).toBeUndefined();
  });

  it('still cannot touch managers, people with every site, or people only at other sites', async () => {
    const other = await user(`otheremp${seq}@company.test`);
    await as(w.lead, `select public.add_member($1, $2, 'employee', array[$3]::uuid[])`, [w.company, `otheremp${seq}@company.test`, w.siteB]);
    await fails(as(w.siteManager, 'select public.remove_member($1, $2)', [w.company, other]), /only remove employees at sites you manage/);
    await fails(as(w.siteManager, 'select public.remove_member($1, $2)', [w.company, w.regional]), /only remove employees at sites you manage/);
    await fails(as(w.siteManager, 'select public.remove_member($1, $2)', [w.company, w.lead]), /Only an owner/);
    await as(w.lead, `select public.add_member($1, $2, 'manager', array[$3, $4]::uuid[])`, [w.company, `co${seq}@company.test`, w.siteA, w.siteB]);
    const co = await user(`co2${seq}@company.test`);
    await as(w.lead, `select public.add_member($1, $2, 'manager', array[$3, $4]::uuid[])`, [w.company, `co2${seq}@company.test`, w.siteA, w.siteB]);
    await fails(as(w.siteManager, 'select public.remove_member($1, $2)', [w.company, co]), /only remove employees at sites you manage/);
    expect(await ids(other)).toEqual({ role: 'employee', facility_ids: [w.siteB] });
  });

  it('works the same for someone invited who hasn’t signed in yet', async () => {
    const email = `invited${seq}@company.test`;
    await as(w.lead, `select public.add_member($1, $2, 'employee', array[$3, $4]::uuid[])`, [w.company, email, w.siteA, w.siteB]);
    await as(w.siteManager, 'select public.cancel_invitation($1, $2)', [w.company, email]);
    expect((await db.query('select facility_ids from invitations where email = $1', [email])).rows).toEqual([{ facility_ids: [w.siteB] }]);
    await fails(as(w.siteManager, 'select public.cancel_invitation($1, $2)', [w.company, email]), /only cancel invitations for your own sites/);
  });
});

describe('site link names and leaving', () => {
  it('“locations” is reserved, because it is the My Locations page', async () => {
    await fails(as(w.lead, `update facilities set slug = 'locations' where id = $1`, [w.siteA]), /check constraint/);
    await as(w.staff, 'select public.set_site_limit($1, null)', [w.company]);
    const [{ add_contract_site: f }] = await as<{ add_contract_site: string }>(w.staff, `select public.add_contract_site($1, 'Locations', null)`, [w.company]);
    expect((await db.query('select slug from facilities where id = $1', [f])).rows[0].slug).toBe('locations-site');
  });

  it('leaving a site you aren’t at changes nothing and logs nothing', async () => {
    const before = (await db.query('select count(*)::int n from audit_log')).rows[0].n;
    await as(w.employee, 'select public.leave_site($1)', [w.siteB]);
    expect((await db.query('select count(*)::int n from audit_log')).rows[0].n).toBe(before);
    expect(await ids(w.employee)).toEqual({ role: 'employee', facility_ids: [w.siteA] });
  });
});
