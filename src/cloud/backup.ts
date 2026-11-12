import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Account backups (All accounts → Download backup / Restore from backup).
 *
 * A backup file holds whole companies: their sites (with links, addresses and
 * join codes), who had access and how, and every map with its working copy,
 * what employees saw, and its saved versions. It is made in the browser from
 * what admins can already read, and restored by admin-only database functions
 * that put everything back under its original ids, so site links, map links
 * and QR signs keep working.
 */
export const BACKUP_FORMAT = 'bergeron-maps/backup';
export const BACKUP_VERSION = 1;
export const BACKUP_EXTENSION = '.bmbackup.json';
/** The app shows a map's latest 200 versions, so that is what a backup keeps. */
export const MAX_VERSIONS_PER_MAP = 200;
/** Versions are sent back in batches of about this size, so no single request gets too large. */
const VERSION_BATCH_BYTES = 4 * 1024 * 1024;

export interface BackupSite {
  id: string; name: string; slug: string; address: string | null; join_code: string | null; created_at: string | null;
}
export interface BackupPerson {
  email: string; role: 'owner' | 'manager' | 'employee'; facility_ids: string[] | null; pending: boolean;
}
export interface BackupVersion {
  id: string; created_at: string; reason: string; label: string; revision: number; doc: unknown;
}
export interface BackupMap {
  id: string; facility_id: string; name: string; slot: number | null; is_public: boolean; deleted_at: string | null;
  created_at: string; updated_at: string; revision: number; draft: unknown;
  published: { name: string; doc: unknown; revision: number; published_at: string } | null;
  versions: BackupVersion[];
}
export interface BackupCompany {
  id: string; name: string; created_at: string; max_sites: number | null; exported_at: string;
  sites: BackupSite[]; people: BackupPerson[]; maps: BackupMap[];
}
export interface BackupFile {
  format: typeof BACKUP_FORMAT; version: number; exportedAt: string; exportedBy: string; companies: BackupCompany[];
}

/** The parts of an All accounts company the backup starts from. */
export interface OverviewCompany {
  id: string; name: string; created_at: string; max_sites?: number | null;
  people: { email: string; role: BackupPerson['role']; facility_ids: string[] | null; pending: boolean }[];
}

function check<T>(r: { data: T; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return r.data;
}

/** Reads one company in full. `onStep` reports progress as plain text. */
export async function backupCompany(db: SupabaseClient, c: OverviewCompany, onStep?: (text: string) => void): Promise<BackupCompany> {
  const exportedAt = new Date().toISOString();
  onStep?.(`Reading ${c.name}’s sites`);
  const sites = check(await db.from('facilities').select('id, name, slug, address, created_at').eq('company_id', c.id).order('created_at')) as
    Omit<BackupSite, 'join_code'>[];
  const withCodes: BackupSite[] = [];
  for (const s of sites) {
    const code = await db.rpc('get_join_code', { p_facility: s.id });
    withCodes.push({ ...s, join_code: code.error ? null : (code.data as string | null) });
  }

  onStep?.(`Reading ${c.name}’s maps`);
  const maps = check(await db.from('maps')
    .select('id, facility_id, name, slot, is_public, deleted_at, created_at, updated_at, revision, draft')
    .eq('company_id', c.id).order('created_at')) as Omit<BackupMap, 'published' | 'versions'>[];
  const published = check(await db.from('published_maps').select('map_id, name, doc, revision, published_at').eq('company_id', c.id)) as
    { map_id: string; name: string; doc: unknown; revision: number; published_at: string }[];
  const pubBy = new Map(published.map((p) => [p.map_id, p]));

  const out: BackupMap[] = [];
  for (const [i, m] of maps.entries()) {
    onStep?.(`Reading versions of ${m.name} (${i + 1} of ${maps.length})`);
    const versions: BackupVersion[] = [];
    // A page at a time: each version is a whole map, background images included.
    for (let from = 0; from < MAX_VERSIONS_PER_MAP; from += 25) {
      const page = check(await db.from('map_versions').select('id, created_at, reason, label, revision, doc')
        .eq('map_id', m.id).order('created_at', { ascending: false }).range(from, Math.min(from + 24, MAX_VERSIONS_PER_MAP - 1))) as BackupVersion[];
      versions.push(...page);
      if (page.length < 25) break;
    }
    const p = pubBy.get(m.id);
    out.push({ ...m, published: p ? { name: p.name, doc: p.doc, revision: p.revision, published_at: p.published_at } : null, versions });
  }

  return {
    id: c.id, name: c.name, created_at: c.created_at, max_sites: c.max_sites ?? null, exported_at: exportedAt,
    sites: withCodes,
    people: c.people.map((p) => ({ email: p.email, role: p.role, facility_ids: p.facility_ids, pending: p.pending })),
    maps: out,
  };
}

export function serializeBackup(companies: BackupCompany[], exportedBy: string, now = new Date()): string {
  const file: BackupFile = { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: now.toISOString(), exportedBy, companies };
  return JSON.stringify(file);
}

export function backupFileName(companies: Pick<BackupCompany, 'name'>[], now = new Date()): string {
  const day = now.toISOString().slice(0, 10);
  const base = companies.length === 1
    ? companies[0].name.trim().replace(/[^\w\- ]+/g, '').replace(/\s+/g, '-').slice(0, 60) || 'company'
    : 'All-accounts';
  return `${base}-backup-${day}${BACKUP_EXTENSION}`;
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Reads a backup file, or throws a message that can be shown as is. */
export function parseBackup(text: string): BackupFile {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('That file isn’t a Bergeron Maps backup (it couldn’t be read).');
  }
  if (isObj(data) && data.format === 'bergeron-maps/map') {
    throw new Error('That’s a single map file. Open it from a site’s maps with Import map file instead.');
  }
  if (!isObj(data) || data.format !== BACKUP_FORMAT || !Array.isArray(data.companies)) {
    throw new Error('That file isn’t a Bergeron Maps backup.');
  }
  if (typeof data.version !== 'number' || data.version > BACKUP_VERSION) {
    throw new Error('That backup was made by a newer version of Bergeron Maps. Reload the page and try again.');
  }
  for (const c of data.companies as unknown[]) {
    if (!isObj(c) || typeof c.id !== 'string' || !UUID.test(c.id) || typeof c.name !== 'string'
      || !Array.isArray(c.sites) || !Array.isArray(c.people) || !Array.isArray(c.maps)) {
      throw new Error('That backup is damaged: a company in it is incomplete.');
    }
    for (const m of c.maps as unknown[]) {
      if (!isObj(m) || typeof m.id !== 'string' || !UUID.test(m.id) || !isObj(m.draft)) throw new Error(`The backup of ${c.name} is damaged: a map in it is incomplete.`);
    }
  }
  return data as unknown as BackupFile;
}

export function backupCounts(c: BackupCompany) {
  return {
    sites: c.sites.length,
    people: c.people.length,
    maps: c.maps.filter((m) => !m.deleted_at).length,
    trashed: c.maps.filter((m) => m.deleted_at).length,
    versions: c.maps.reduce((n, m) => n + m.versions.length, 0),
  };
}

export interface RestoreResult {
  name: string; sites: number; members: number; invited: number; maps: number; published: number; moved_to_trash: number;
  slug_changes: { site: string; was: string; now: string }[];
  versions: number; versionErrors: number;
}

/** Splits a map's versions into batches small enough to send one at a time. */
export function versionBatches(versions: BackupVersion[], maxBytes = VERSION_BATCH_BYTES): BackupVersion[][] {
  const out: BackupVersion[][] = [];
  let cur: BackupVersion[] = [];
  let size = 0;
  for (const v of versions) {
    const n = JSON.stringify(v).length;
    if (cur.length && size + n > maxBytes) {
      out.push(cur);
      cur = [];
      size = 0;
    }
    cur.push(v);
    size += n;
  }
  if (cur.length) out.push(cur);
  return out;
}

/**
 * Brings one company back: first everything but the versions (all or nothing),
 * then the versions map by map. A version batch that fails is counted, not
 * fatal: the company, its people and its maps are already back.
 */
export async function restoreCompany(db: SupabaseClient, c: BackupCompany, onStep?: (text: string) => void): Promise<RestoreResult> {
  onStep?.(`Restoring ${c.name}`);
  const core = { ...c, maps: c.maps.map(({ versions: _v, ...m }) => m) };
  const r = await db.rpc('admin_restore_company', { p_backup: core });
  if (r.error) {
    if (/admin_restore_company/.test(r.error.message) && /function|schema cache/i.test(r.error.message)) {
      throw new Error('Restoring needs a database update that hasn’t been run yet. Run the step 11 SQL in Supabase, then try again.');
    }
    throw new Error(r.error.message);
  }
  const summary = r.data as Omit<RestoreResult, 'versions' | 'versionErrors'>;
  let versions = 0;
  let versionErrors = 0;
  for (const [i, m] of c.maps.entries()) {
    if (!m.versions.length) continue;
    onStep?.(`Restoring versions of ${m.name} (${i + 1} of ${c.maps.length})`);
    for (const batch of versionBatches(m.versions)) {
      const v = await db.rpc('admin_restore_versions', { p_map: m.id, p_versions: batch });
      if (v.error) versionErrors += batch.length;
      else versions += v.data as number;
    }
  }
  return { ...summary, versions, versionErrors };
}
