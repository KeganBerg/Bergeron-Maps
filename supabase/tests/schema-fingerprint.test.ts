/**
 * Keeps supabase/schema-fingerprint.expected.txt in step with supabase/migrations. That file is what
 * the live database should show when supabase/schema-fingerprint.sql is run in the Supabase SQL Editor
 * (docs/DATABASE.md). After adding a migration, refresh it with UPDATE_FINGERPRINT=1 npm run test:db.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, expect, it } from 'vitest';

const ADMIN_URL = process.env.DATABASE_URL;
if (!ADMIN_URL) throw new Error('Set DATABASE_URL to a Postgres server to run the database tests (see README).');

const dbName = `bm_fp_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
const root = join(__dirname, '..');
let admin: pg.Client;
let db: pg.Client;

beforeAll(async () => {
  admin = new pg.Client({ connectionString: ADMIN_URL });
  await admin.connect();
  await admin.query(`create database ${dbName}`);
  const url = new URL(ADMIN_URL);
  url.pathname = `/${dbName}`;
  db = new pg.Client({ connectionString: url.toString() });
  await db.connect();
  for (const f of [join(root, 'tests', 'supabase-shim.sql'), ...readdirSync(join(root, 'migrations')).sort().map((f) => join(root, 'migrations', f))])
    await db.query(readFileSync(f, 'utf8'));
});

afterAll(async () => {
  await db?.end();
  await admin?.query(`drop database if exists ${dbName}`);
  await admin?.end();
});

it('the expected schema fingerprint matches what supabase/migrations builds', async () => {
  const r = await db.query(readFileSync(join(root, 'schema-fingerprint.sql'), 'utf8'));
  const got = String(r.rows[0].fingerprint) + '\n';
  const file = join(root, 'schema-fingerprint.expected.txt');
  if (process.env.UPDATE_FINGERPRINT) writeFileSync(file, got);
  expect(got).toBe(readFileSync(file, 'utf8'));
});
