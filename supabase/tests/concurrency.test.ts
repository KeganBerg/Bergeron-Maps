/**
 * Two managers at once, for real: each runs on its own database connection, and
 * both requests are in flight at the same moment. These are the races that
 * saving under stress depends on (2026-11-19 audit): two saves from the same
 * revision, two maps taking the last slot, two maps taking the last live place.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const ADMIN_URL = process.env.DATABASE_URL;
if (!ADMIN_URL) throw new Error('Set DATABASE_URL to a Postgres server to run the database tests (see README).');

const dbName = `bm_race_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
let admin: pg.Client;
/** Setup connection, plus one connection per manager so their requests really overlap. */
let db: pg.Client;
let one: pg.Client;
let two: pg.Client;

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
  one = new pg.Client({ connectionString: url.toString() });
  two = new pg.Client({ connectionString: url.toString() });
  await Promise.all([db.connect(), one.connect(), two.connect()]);
  for (const f of sqlFiles) await db.query(readFileSync(f, 'utf8'));
});

afterAll(async () => {
  await Promise.all([db?.end(), one?.end(), two?.end()]);
  await admin?.query(`drop database if exists ${dbName}`);
  await admin?.end();
});

/** Runs SQL as a signed-in user inside one transaction, like a Supabase request. */
async function as<T extends pg.QueryResultRow = Record<string, unknown>>(c: pg.Client, who: string, sql: string, params: unknown[] = []): Promise<T[]> {
  await c.query('begin');
  try {
    await c.query('set local role authenticated');
    await c.query(`select set_config('request.jwt.claim.sub', $1, true)`, [who]);
    const r = await c.query<T>(sql, params);
    await c.query('commit');
    return r.rows;
  } catch (e) {
    await c.query('rollback');
    throw e;
  }
}

/**
 * Starts the same kind of request on both connections and holds the first one's
 * transaction open (after its statement ran) until the second has started, so
 * the second really has to wait on the first instead of simply running after it.
 */
async function race(who: [string, string], sql: [string, string], params: [unknown[], unknown[]]) {
  await one.query('begin');
  await one.query('set local role authenticated');
  await one.query(`select set_config('request.jwt.claim.sub', $1, true)`, [who[0]]);
  let first: { ok: boolean; error?: string; rows?: unknown[] };
  try {
    first = { ok: true, rows: (await one.query(sql[0], params[0])).rows };
  } catch (e) {
    first = { ok: false, error: (e as Error).message };
  }
  const second = as(two, who[1], sql[1], params[1]).then(
    (rows) => ({ ok: true, rows }) as { ok: boolean; error?: string; rows?: unknown[] },
    (e: Error) => ({ ok: false, error: e.message }) as { ok: boolean; error?: string; rows?: unknown[] },
  );
  // Give the second request time to reach the database and block.
  await new Promise((r) => setTimeout(r, 150));
  await one.query(first.ok ? 'commit' : 'rollback');
  return [first, await second] as const;
}

const doc = (name: string) => ({ id: 'local', name, floors: [], schemaVersion: 1 });

let seq = 0;
let w: { owner: string; manager: string; facility: string; map: string };

beforeEach(async () => {
  seq++;
  const mk = async (email: string) => (await db.query<{ id: string }>('insert into auth.users (email) values ($1) returning id', [email])).rows[0].id;
  const owner = await mk(`owner${seq}@race.test`);
  const manager = await mk(`manager${seq}@race.test`);
  await db.query('insert into platform_admins (email) values ($1)', [`owner${seq}@race.test`]);
  const [{ create_company: company }] = await as<{ create_company: string }>(db, owner, `select public.create_company('Company', 'Site Name')`);
  const [{ id: facility }] = await as<{ id: string }>(db, owner, 'select id from facilities where company_id = $1', [company]);
  await as(db, owner, `select public.add_member($1, $2, 'manager')`, [company, `manager${seq}@race.test`]);
  await db.query('delete from platform_admins where email = $1', [`owner${seq}@race.test`]);
  const [{ id: map }] = await as<{ id: string }>(db, manager, `insert into maps (facility_id, name, draft) values ($1, 'Garage', $2) returning id`, [facility, doc('v1')]);
  w = { owner, manager, facility, map };
});

describe('two managers at the same moment', () => {
  it('two saves from the same revision: exactly one lands, the other changes nothing (so the app reports a conflict)', async () => {
    const save = `update maps set draft = $1 where id = $2 and revision = 1 and deleted_at is null returning revision, draft->>'name' as name`;
    const [a, b] = await race([w.owner, w.manager], [save, save], [[doc('owner edit'), w.map], [doc('manager edit'), w.map]]);
    expect(a.rows).toEqual([{ revision: 2, name: 'owner edit' }]);
    expect(b.rows).toEqual([]);
    const [row] = await as<{ revision: number; name: string }>(db, w.manager, `select revision, draft->>'name' as name from maps where id = $1`, [w.map]);
    expect(row).toEqual({ revision: 2, name: 'owner edit' });
  });

  it('a save racing a delete does not bring the map back or save into the trash', async () => {
    const [del, save] = await race(
      [w.owner, w.manager],
      ['update maps set deleted_at = now() where id = $1 returning id', `update maps set draft = $1 where id = $2 and revision = 1 and deleted_at is null returning id`],
      [[w.map], [doc('late edit'), w.map]],
    );
    expect(del.rows).toHaveLength(1);
    expect(save.rows).toEqual([]);
    const [row] = await as<{ deleted: boolean; name: string }>(db, w.manager, `select deleted_at is not null as deleted, draft->>'name' as name from maps where id = $1`, [w.map]);
    expect(row).toEqual({ deleted: true, name: 'v1' });
  });

  it('two new maps for the last free slot: one gets it, the other is told the site is full', async () => {
    for (let i = 2; i <= 4; i++) await as(db, w.manager, `insert into maps (facility_id, name, draft) values ($1, $2, $3)`, [w.facility, `Map ${i}`, doc(`Map ${i}`)]);
    const add = `insert into maps (facility_id, name, draft) values ($1, $2, $3) returning slot`;
    const [a, b] = await race([w.owner, w.manager], [add, add], [[w.facility, 'Owner map', doc('o')], [w.facility, 'Manager map', doc('m')]]);
    expect(a.rows).toEqual([{ slot: 5 }]);
    expect(b.ok).toBe(false);
    expect(b.error).toMatch(/All 5 map slots at “Site Name” are in use/);
    const [{ n }] = await as<{ n: number }>(db, w.manager, 'select count(*)::int n from maps where facility_id = $1 and deleted_at is null', [w.facility]);
    expect(n).toBe(5);
  });

  it('a restore and a new map racing for the last slot: only one of them fits', async () => {
    const [{ id: trashed }] = await as<{ id: string }>(db, w.manager, `insert into maps (facility_id, name, draft) values ($1, 'Old', $2) returning id`, [w.facility, doc('old')]);
    await as(db, w.manager, 'update maps set deleted_at = now() where id = $1', [trashed]);
    for (let i = 2; i <= 4; i++) await as(db, w.manager, `insert into maps (facility_id, name, draft) values ($1, $2, $3)`, [w.facility, `Map ${i}`, doc(`Map ${i}`)]);
    const [restore, add] = await race(
      [w.owner, w.manager],
      ['update maps set deleted_at = null where id = $1 returning slot', `insert into maps (facility_id, name, draft) values ($1, 'New', $2) returning slot`],
      [[trashed], [w.facility, doc('new')]],
    );
    expect(restore.rows).toEqual([{ slot: 5 }]);
    expect(add.ok).toBe(false);
    expect(add.error).toMatch(/All 5 map slots/);
  });

  it('two maps published at once when one live place is left: one goes live, the other is refused', async () => {
    const add = async (name: string) =>
      (await as<{ id: string }>(db, w.manager, `insert into maps (facility_id, name, draft) values ($1, $2, $3) returning id`, [w.facility, name, doc(name)]))[0].id;
    const b = await add('B');
    const c = await add('C');
    await as(db, w.manager, 'select public.publish_map($1)', [w.map]);
    const pub = 'select public.publish_map($1)';
    const [first, second] = await race([w.owner, w.manager], [pub, pub], [[b], [c]]);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
    expect(second.error).toMatch(/already has 2 live maps/);
    const live = await as<{ map_id: string }>(db, w.manager, 'select map_id from published_maps where facility_id = $1 order by map_id', [w.facility]);
    expect(live.map((r) => r.map_id).sort()).toEqual([w.map, b].sort());
  });

  it('publishing while another manager saves publishes one whole version, never a mix', async () => {
    const [save, pub] = await race(
      [w.owner, w.manager],
      [`update maps set draft = $1 where id = $2 and revision = 1 returning revision`, 'select public.publish_map($1)'],
      [[doc('v2'), w.map], [w.map]],
    );
    expect(save.ok && pub.ok).toBe(true);
    const [p] = await as<{ revision: number; name: string }>(db, w.manager, `select revision, doc->>'name' as name from published_maps where map_id = $1`, [w.map]);
    // The publish waited for the save, or ran before it: either way the copy and its revision match.
    expect([{ revision: 1, name: 'v1' }, { revision: 2, name: 'v2' }]).toContainEqual(p);
  });
});
