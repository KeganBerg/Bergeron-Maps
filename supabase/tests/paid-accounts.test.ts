/**
 * Paid accounts (migration 20261124030000): the Worker opens a company for a Stripe order, and
 * pauses it (nobody in it has access, public links go dark) until it pays again.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const ADMIN_URL = process.env.DATABASE_URL;
if (!ADMIN_URL) throw new Error('Set DATABASE_URL to a Postgres server to run the database tests (see README).');

const dbName = `bm_paid_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
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

/** Runs as a signed-in person (an id), a visitor (null) or the Worker ('worker', the service role). */
async function as<T extends pg.QueryResultRow = Record<string, unknown>>(who: string | null, sql: string, params: unknown[] = []): Promise<T[]> {
  await db.query('begin');
  try {
    await db.query(`set local role ${who === 'worker' ? 'service_role' : who ? 'authenticated' : 'anon'}`);
    await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [who && who !== 'worker' ? who : '']);
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

const provision = (customer: string, email: string, locations = 2, term: number | null = 12) =>
  as<{ company_id: string; created: boolean }>('worker',
    `select * from public.provision_paid_account($1, 'sub_1', 'Company', $2, $3, $4)`, [customer, email, locations, term]);
const pause = (customer: string, paused: boolean) =>
  as<{ set_account_paused: string | null }>('worker', 'select public.set_account_paused($1, $2)', [customer, paused]);

let seq = 0;
let customer: string;
let ownerEmail: string;
let owner: string;

beforeEach(async () => {
  seq++;
  customer = `cus_test${seq}`;
  ownerEmail = `owner${seq}@company.test`;
  owner = await user(ownerEmail);
});

describe('opening an account for a paid order', () => {
  it('makes the buyer the owner of a new company with one site and room for what they bought', async () => {
    const [{ company_id: c, created }] = await provision(customer, ownerEmail.toUpperCase(), 3, 6);
    expect(created).toBe(true);
    const [co] = (await db.query('select max_sites, stripe_customer_id, contract_term_months, paused_at from companies where id = $1', [c])).rows;
    expect(co).toEqual({ max_sites: 3, stripe_customer_id: customer, contract_term_months: 6, paused_at: null });
    expect((await db.query('select name from facilities where company_id = $1', [c])).rows).toEqual([{ name: 'First location' }]);
    expect((await db.query('select user_id, role from memberships where company_id = $1', [c])).rows).toEqual([{ user_id: owner, role: 'owner' }]);
  });

  it('a buyer who has never signed in is invited as owner', async () => {
    const [{ company_id: c }] = await provision(customer, `new${seq}@company.test`);
    expect((await db.query('select email, role from invitations where company_id = $1', [c])).rows).toEqual([{ email: `new${seq}@company.test`, role: 'owner' }]);
  });

  it('a repeated webhook answers the same company instead of opening a second one', async () => {
    const [first] = await provision(customer, ownerEmail);
    const [again] = await provision(customer, ownerEmail);
    expect(again).toEqual({ company_id: first.company_id, created: false });
    expect((await db.query('select count(*)::int n from companies where stripe_customer_id = $1', [customer])).rows[0].n).toBe(1);
  });

  it('refuses a missing customer, a bad email or zero locations', async () => {
    await expect(provision('', ownerEmail)).rejects.toThrow(/customer is missing/);
    await expect(provision(customer, 'not-an-email')).rejects.toThrow(/email is not valid/);
    await expect(provision(customer, ownerEmail, 0)).rejects.toThrow(/At least 1/);
  });
});

describe('pausing until paid', () => {
  it('takes away everyone\'s access and public links, and gives it all back on payment', async () => {
    const [{ company_id: c }] = await provision(customer, ownerEmail);
    const [{ id: site, slug }] = (await db.query('select id, slug from facilities where company_id = $1', [c])).rows;
    const [{ id: map }] = await as<{ id: string }>(owner, `insert into maps (facility_id, name, draft, is_public) values ($1, 'Visitor map', '{}'::jsonb, true) returning id`, [site]);
    await as(owner, 'select public.publish_map($1)', [map]);
    await as(owner, `select public.add_member($1, $2, 'manager')`, [c, `mgr${seq}@company.test`]);
    await db.query('insert into auth.sessions (user_id) values ($1)', [owner]);
    expect(await as(null, 'select name from public.get_public_site($1)', [slug])).toHaveLength(1);

    expect((await pause(customer, true))[0].set_account_paused).toBe(c);
    expect(await as(owner, 'select id from maps where company_id = $1', [c])).toEqual([]);
    expect(await as(null, 'select name from public.get_public_site($1)', [slug])).toEqual([]);
    expect(await as(null, 'select name from public.get_public_map($1)', [map])).toEqual([]);
    expect((await db.query('select count(*)::int n from auth.sessions where user_id = $1', [owner])).rows[0].n).toBe(0);
    expect((await db.query('select count(*)::int n from invitations where company_id = $1', [c])).rows[0].n).toBe(0);
    expect(await as(owner, 'select company_name from public.my_paused_accounts()')).toEqual([{ company_name: 'Company' }]);

    // Pausing twice changes nothing.
    await pause(customer, true);
    expect((await db.query('select count(*)::int n from paused_memberships where company_id = $1', [c])).rows[0].n).toBe(1);

    await pause(customer, false);
    expect(await as(owner, 'select id from maps where company_id = $1', [c])).toEqual([{ id: map }]);
    expect(await as(null, 'select name from public.get_public_site($1)', [slug])).toHaveLength(1);
    expect((await db.query('select email from invitations where company_id = $1', [c])).rows).toEqual([{ email: `mgr${seq}@company.test` }]);
    expect(await as(owner, 'select company_name from public.my_paused_accounts()')).toEqual([]);
    expect((await db.query('select count(*)::int n from paused_memberships where company_id = $1', [c])).rows[0].n).toBe(0);
    const actions = (await db.query('select action from audit_log where company_id = $1 order by created_at, action', [c])).rows.map((r) => r.action);
    expect(actions).toEqual(expect.arrayContaining(['company.created', 'company.paused', 'company.resumed']));
  });

  it('an invited owner sees the pause too', async () => {
    const email = `later${seq}@company.test`;
    await provision(customer, email);
    await pause(customer, true);
    const later = await user(email);
    expect(await as(later, 'select company_name from public.my_paused_accounts()')).toEqual([{ company_name: 'Company' }]);
  });

  it('answers null for a customer with no account', async () => {
    expect((await pause('cus_nobody', true))[0].set_account_paused).toBeNull();
  });
});

describe('who can call it', () => {
  it('customers and visitors can open or pause nothing, and cannot read the paused tables', async () => {
    for (const who of [owner, null]) {
      await expect(as(who, `select * from public.provision_paid_account('cus_x', 'sub', 'X', 'a@b.co', 1)`)).rejects.toThrow(/permission denied/);
      await expect(as(who, `select public.set_account_paused('cus_x', true)`)).rejects.toThrow(/permission denied/);
      await expect(as(who, 'select * from public.paused_memberships')).rejects.toThrow(/permission denied/);
    }
    await expect(as(null, 'select * from public.my_paused_accounts()')).rejects.toThrow(/permission denied/);
  });
});
