/**
 * Restore drill: the worst case, rehearsed end to end on throwaway databases.
 *
 * The live Supabase project is lost. A fresh one is built from
 * supabase/migrations, an admin signs in, and "Download backup of all
 * accounts" (made earlier from the old project) is restored into it with
 * Restore from backup. This runs the app's own backup and restore code
 * (src/cloud/backup.ts), the file goes through the same save and open steps,
 * and every row that matters is compared, old project against new.
 *
 * See docs/RECOVERY.md for the runbook this rehearses.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  backupCompany, parseBackup, restoreCompany, serializeBackup, type OverviewCompany, type RestoreResult,
} from '../../src/cloud/backup';
import type { Db } from '../../src/cloud/db';

const ADMIN_URL = process.env.DATABASE_URL;
if (!ADMIN_URL) throw new Error('Set DATABASE_URL to a Postgres server to run the database tests (see README).');

const root = join(__dirname, '..');
const sqlFiles = [
  join(root, 'tests', 'supabase-shim.sql'),
  ...readdirSync(join(root, 'migrations')).sort().map((f) => join(root, 'migrations', f)),
];
const stamp = `${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
const OLD = `bm_drill_old_${stamp}`;
const NEW = `bm_drill_new_${stamp}`;
let server: pg.Client;
let oldDb: pg.Client;
let newDb: pg.Client;

async function freshProject(name: string): Promise<pg.Client> {
  await server.query(`create database ${name}`);
  const url = new URL(ADMIN_URL!);
  url.pathname = `/${name}`;
  const c = new pg.Client({ connectionString: url.toString() });
  await c.connect();
  for (const f of sqlFiles) await c.query(readFileSync(f, 'utf8'));
  await c.query('create table auth.sessions (id uuid primary key default gen_random_uuid(), user_id uuid not null)');
  return c;
}

beforeAll(async () => {
  server = new pg.Client({ connectionString: ADMIN_URL });
  await server.connect();
  oldDb = await freshProject(OLD);
  newDb = await freshProject(NEW);
}, 60000);

afterAll(async () => {
  await oldDb?.end();
  await newDb?.end();
  await server?.query(`drop database if exists ${OLD}`);
  await server?.query(`drop database if exists ${NEW}`);
  await server?.end();
});

/** Runs one statement as a signed-in person, through row-level security, as the app's requests do. */
async function as<T extends pg.QueryResultRow = Record<string, unknown>>(db: pg.Client, who: string, sql: string, params: unknown[] = []): Promise<T[]> {
  await db.query('begin');
  try {
    await db.query('set local role authenticated');
    await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [who]);
    const r = await db.query<T>(sql, params);
    await db.query('commit');
    return r.rows;
  } catch (e) {
    await db.query('rollback');
    throw e;
  }
}

/**
 * The few parts of the Supabase client that backup.ts uses (select, eq, order,
 * range, rpc), answered by Postgres as the signed-in admin, so the app's own
 * backup and restore code runs unchanged.
 */
function clientFor(db: pg.Client, who: string): Db {
  type R = { data: unknown; error: { message: string } | null };
  const run = async (sql: string, params: unknown[], one = false): Promise<R> => {
    try {
      const rows = await as(db, who, sql, params);
      return { data: one ? Object.values(rows[0] ?? {})[0] ?? null : rows, error: null };
    } catch (e) {
      return { data: null, error: { message: (e as Error).message } };
    }
  };
  const from = (table: string) => {
    let cols = '*';
    const where: string[] = [];
    const params: unknown[] = [];
    const orderBy: string[] = [];
    let limit = '';
    const q = {
      select(c: string) { cols = c; return q; },
      eq(col: string, v: unknown) { params.push(v); where.push(`${col} = $${params.length}`); return q; },
      order(col: string, o?: { ascending?: boolean }) { orderBy.push(`${col} ${o?.ascending === false ? 'desc' : 'asc'}`); return q; },
      range(a: number, b: number) { limit = ` limit ${b - a + 1} offset ${a}`; return q; },
      then(ok: (r: R) => unknown, bad?: (e: unknown) => unknown) {
        const sql = `select ${cols} from public.${table}${where.length ? ` where ${where.join(' and ')}` : ''}${orderBy.length ? ` order by ${orderBy.join(', ')}` : ''}${limit}`;
        return run(sql, params).then(ok, bad);
      },
    };
    return q;
  };
  const rpc = (fn: string, args: Record<string, unknown> = {}) => {
    const names = Object.keys(args);
    const sql = `select public.${fn}(${names.map((n, i) => `${n} => $${i + 1}`).join(', ')})`;
    const values = names.map((n) => (args[n] !== null && typeof args[n] === 'object' ? JSON.stringify(args[n]) : args[n]));
    return { then: (ok: (r: R) => unknown, bad?: (e: unknown) => unknown) => run(sql, values, true).then(ok, bad) };
  };
  return { from, rpc } as unknown as Db;
}

async function user(db: pg.Client, email: string): Promise<string> {
  const r = await db.query<{ id: string }>('insert into auth.users (email) values ($1) returning id', [email]);
  return r.rows[0].id;
}

/** A map about the size of a real multi-floor garage: hundreds of spaces and a photographed sketch behind one floor. */
function bigDoc(name: string, spaces: number, n = 0) {
  const objects = Array.from({ length: spaces }, (_, i) => ({
    id: `s${i}`, type: 'space', label: String(100 + i), x: (i % 40) * 9, y: Math.floor(i / 40) * 18, w: 9, h: 18, rotation: 0,
  }));
  return {
    id: 'local', name, schemaVersion: 1, n,
    floors: [
      { id: 'f1', name: 'Level 1', objects, background: { src: `data:image/jpeg;base64,${'A'.repeat(1_500_000)}`, opacity: 0.5 } },
      { id: 'f2', name: 'Level 2', objects: objects.slice(0, spaces / 2) },
    ],
  };
}
const smallDoc = (name: string, n = 0) => ({ id: 'local', name, schemaVersion: 1, n, floors: [{ id: 'f1', name: 'Level 1', objects: [] }] });

/** What gets compared: everything people would notice, keyed by the ids that links and QR signs use. */
async function snapshot(db: pg.Client) {
  const q = async (sql: string) => (await db.query(sql)).rows;
  return {
    companies: await q('select id, name, max_sites from companies order by id'),
    sites: await q('select id, company_id, name, slug, address, join_code from facilities order by id'),
    access: await q(`select m.company_id, u.email, m.role, m.facility_ids from memberships m join auth.users u on u.id = m.user_id
                      union all select company_id, email, role, facility_ids from invitations order by 2, 1`),
    maps: await q('select id, company_id, facility_id, name, slot, is_public, deleted_at is not null trashed, md5(draft::text) draft from maps order by id'),
    published: await q(`select p.map_id, p.facility_id, p.name, md5(p.doc::text) doc, p.revision = m.revision up_to_date
                         from published_maps p join maps m on m.id = p.map_id order by p.map_id`),
    versions: await q('select id, map_id, created_at, reason, label, revision, md5(doc::text) doc from map_versions order by id'),
  };
}

describe('restore drill: the whole Supabase project is lost', () => {
  let before: Awaited<ReturnType<typeof snapshot>>;
  let fileText = '';
  let results: RestoreResult[] = [];
  let timings: { backupMs: number; restoreMs: number; fileMb: number };

  it('builds a realistic old project', async () => {
    const staff = await user(oldDb, 'kegan@bergeronmaps.test');
    await oldDb.query(`insert into platform_admins (email) values ('kegan@bergeronmaps.test')`);
    for (const [ci, company] of ['North Company', 'South Company', 'Pilot Company'].entries()) {
      const owner = `owner${ci}@company${ci}.test`;
      await user(oldDb, owner);
      const [{ setup_company: id }] = await as<{ setup_company: string }>(oldDb, staff,
        `select public.setup_company($1, 'Main Garage', '500 Main St', $2, 5)`, [company, owner]);
      const ownerId = (await oldDb.query('select id from auth.users where email = $1', [owner])).rows[0].id as string;
      const sites = [(await oldDb.query<{ id: string }>('select id from facilities where company_id = $1', [id])).rows[0].id];
      for (const s of ['East Lot', 'Hotel Valet']) {
        const [{ add_contract_site: sid }] = await as<{ add_contract_site: string }>(oldDb, staff, 'select public.add_contract_site($1, $2, null)', [id, s]);
        sites.push(sid);
      }
      // A site manager, two employees who joined with the site code, and an invitation nobody has accepted yet.
      await user(oldDb, `sm${ci}@company${ci}.test`);
      await as(oldDb, ownerId, `select public.add_member($1, $2, 'manager', array[$3]::uuid[])`, [id, `sm${ci}@company${ci}.test`, sites[1]]);
      for (const e of [`valet${ci}a@mail.test`, `valet${ci}b@mail.test`]) {
        const eid = await user(oldDb, e);
        const code = (await oldDb.query('select join_code from facilities where id = $1', [sites[0]])).rows[0].join_code;
        await as(oldDb, eid, 'select public.join_site($1)', [code]);
      }
      await as(oldDb, ownerId, `select public.add_member($1, $2, 'employee', array[$3]::uuid[])`, [id, `new${ci}@mail.test`, sites[2]]);

      // Maps: the big garage (live, with unpublished changes), a second live map, a public one, and one in Recently deleted.
      const insert = async (site: string, name: string, draft: unknown, isPublic = false) =>
        (await as<{ id: string }>(oldDb, ownerId, 'insert into maps (facility_id, name, draft, is_public) values ($1, $2, $3, $4) returning id',
          [site, name, JSON.stringify(draft), isPublic]))[0].id;
      const garage = await insert(sites[0], 'Garage', ci === 0 ? bigDoc('Garage', 1200) : smallDoc('Garage'));
      await as(oldDb, ownerId, 'select public.publish_map($1)', [garage]);
      await as(oldDb, ownerId, 'update maps set draft = $2 where id = $1', [garage, JSON.stringify(ci === 0 ? bigDoc('Garage', 1200, 1) : smallDoc('Garage', 1))]);
      const roof = await insert(sites[0], 'Roof level', smallDoc('Roof level'));
      await as(oldDb, ownerId, 'select public.publish_map($1)', [roof]);
      const lot = await insert(sites[1], 'East Lot', smallDoc('East Lot'), true);
      await as(oldDb, ownerId, 'select public.publish_map($1)', [lot]);
      const old = await insert(sites[2], 'Old layout', smallDoc('Old layout'));
      await as(oldDb, ownerId, 'update maps set deleted_at = now() - interval \'3 days\' where id = $1', [old]);
      // Saved versions: well past the 25 a page the backup reads, on a small map, all saved at the same moment
      // (as a batch restored earlier would be), so paging has to be exact.
      for (let v = 0; v < 60; v++) {
        await as(oldDb, ownerId, `insert into map_versions (map_id, reason, label, revision, doc, created_at)
          values ($1, 'manual', $2, $3, $4, now())`, [lot, `Save ${v}`, v + 1, JSON.stringify(smallDoc('East Lot', v))]);
      }
      if (ci === 0) {
        for (let v = 0; v < 4; v++) {
          await as(oldDb, ownerId, `insert into map_versions (map_id, reason, label, revision, doc) values ($1, 'manual', $2, 1, $3)`,
            [garage, `Garage ${v}`, JSON.stringify(bigDoc('Garage', 1200, v))]);
        }
      }
    }
    before = await snapshot(oldDb);
    expect(before.companies).toHaveLength(3);
    expect(before.versions.length).toBeGreaterThan(180);
  }, 60000);

  it('downloads a backup of all accounts from the old project', async () => {
    const staff = (await oldDb.query(`select id from auth.users where email = 'kegan@bergeronmaps.test'`)).rows[0].id as string;
    const [{ admin_overview: all }] = await as<{ admin_overview: OverviewCompany[] }>(oldDb, staff, 'select public.admin_overview()');
    const t = Date.now();
    const out = [];
    for (const c of all) out.push(await backupCompany(clientFor(oldDb, staff), c));
    fileText = serializeBackup(out, 'kegan@bergeronmaps.test');
    timings = { backupMs: Date.now() - t, restoreMs: 0, fileMb: fileText.length / 1e6 };
    expect(out).toHaveLength(3);
  }, 60000);

  it('restores every company into a new, empty project', async () => {
    // The new project: migrations run, the admin signs in for the first time, nobody else exists yet.
    const staff = await user(newDb, 'kegan@bergeronmaps.test');
    await newDb.query(`insert into platform_admins (email) values ('kegan@bergeronmaps.test')`);
    const file = parseBackup(fileText);
    const t = Date.now();
    for (const c of file.companies) results.push(await restoreCompany(clientFor(newDb, staff), c));
    timings.restoreMs = Date.now() - t;
    console.info(`Restore drill: backup file ${timings.fileMb.toFixed(1)} MB, made in ${timings.backupMs} ms, restored in ${timings.restoreMs} ms`);
    expect(results.map((r) => r.versionErrors)).toEqual([0, 0, 0]);
    expect(results.every((r) => r.slug_changes.length === 0)).toBe(true);
  }, 60000);

  it('the new project matches the old one', async () => {
    const after = await snapshot(newDb);
    expect(after.companies).toEqual(before.companies);
    expect(after.sites).toEqual(before.sites); // same ids, links and join codes: printed QR signs and site links keep working
    expect(after.maps).toEqual(before.maps);
    expect(after.published).toEqual(before.published); // employees see the same maps, unpublished changes stay unpublished
    expect(after.versions).toEqual(before.versions);
    // Nobody but the admin has a sign-in yet, so everyone comes back as an invitation for the same role and sites.
    expect(after.access).toEqual(before.access.map((a) => ({ ...a })));
    expect((await newDb.query('select count(*)::int n from memberships')).rows[0].n).toBe(0);
  });

  it('people get their access back the first time they sign in to the new project', async () => {
    const email = 'sm0@company0.test';
    const id = await user(newDb, email); // signing up claims their invitations, as in the live project
    const sites = await as<{ name: string }>(newDb, id, 'select name from facilities order by name');
    expect(sites.map((s) => s.name)).toEqual(['East Lot']);
    const maps = await as<{ name: string }>(newDb, id, 'select name from maps where deleted_at is null order by name');
    expect(maps.map((m) => m.name)).toEqual(['East Lot']);
  });
});
