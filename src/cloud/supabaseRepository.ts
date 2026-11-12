import type { SupabaseClient } from '@supabase/supabase-js';
import { migrateDocument } from '../model/migrate';
import type { MapDocument } from '../model/types';
import {
  ConflictError,
  MapGoneError,
  summarize,
  type MapRepository,
  type MapSummary,
  type PublishInfo,
  type VersionMeta,
  type VersionReason,
} from '../storage/repository';

interface MapRow {
  id: string;
  name: string;
  draft: MapDocument;
  revision: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  facility_id: string;
  slot: number | null;
  facilities: { name: string } | null;
  published_maps: { published_at: string; revision: number } | null;
}

const MAP_COLUMNS = 'id, name, draft, revision, created_at, updated_at, deleted_at, facility_id, slot, facilities(name), published_maps(published_at, revision)';

const LABELS: Record<VersionReason, string> = {
  auto: 'Automatic save point',
  manual: 'Saved version',
  'before-restore': 'Before restoring an older version',
  conflict: 'Your changes (kept during a conflict)',
  publish: 'Published to employees',
};

function check<T>(r: { data: T; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return r.data;
}

/**
 * Row-level security turns a write you aren't allowed to make into "0 rows
 * changed" rather than an error, so say so instead of pretending it worked.
 */
function changed(r: { data: unknown[] | null; error: { message: string } | null }): void {
  if (!check(r)?.length) throw new Error('That didn’t go through. The map may have been changed or removed, or you no longer have access to it.');
}

/** The stored document, with the server's id, name and revision as the source of truth. */
function toDoc(row: Pick<MapRow, 'id' | 'name' | 'draft' | 'revision' | 'created_at' | 'updated_at'>): MapDocument {
  return migrateDocument({ ...row.draft, id: row.id, name: row.name, revision: row.revision, createdAt: row.created_at, updatedAt: row.updated_at });
}

function toSummary(row: MapRow): MapSummary {
  const pub = row.published_maps;
  return summarize(toDoc(row), row.deleted_at ?? undefined, {
    site: row.facilities?.name,
    publish: pub ? { publishedAt: pub.published_at, publishedRevision: pub.revision } : undefined,
    slot: row.slot,
  });
}

/**
 * Online storage for one company. Every read and write goes through
 * row-level security, so a person only ever reaches the sites they were given.
 */
export class SupabaseRepository implements MapRepository {
  constructor(private readonly db: SupabaseClient, readonly companyId: string, private readonly onlySite?: string) {}

  private async rows(deleted: boolean): Promise<MapRow[]> {
    let q = this.db.from('maps').select(MAP_COLUMNS).eq('company_id', this.companyId);
    q = deleted ? q.not('deleted_at', 'is', null) : q.is('deleted_at', null);
    if (this.onlySite) q = q.eq('facility_id', this.onlySite);
    return check(await q.order('updated_at', { ascending: false })) as unknown as MapRow[];
  }

  async listMaps(): Promise<MapSummary[]> {
    return (await this.rows(false)).map(toSummary);
  }

  async listTrash(): Promise<MapSummary[]> {
    return (await this.rows(true)).map(toSummary);
  }

  /** What an employee can open: published maps of the sites they belong to. */
  async listPublishedMaps(): Promise<MapSummary[]> {
    let q = this.db.from('published_maps').select('map_id, name, doc, revision, published_at, facilities(name)').eq('company_id', this.companyId);
    if (this.onlySite) q = q.eq('facility_id', this.onlySite);
    const rows = check(await q.order('name')) as unknown as {
      map_id: string; name: string; doc: MapDocument; revision: number; published_at: string; facilities: { name: string } | null;
    }[];
    return rows.map((r) =>
      summarize({ ...r.doc, id: r.map_id, name: r.name, revision: r.revision, updatedAt: r.published_at }, undefined, {
        site: r.facilities?.name,
        publish: { publishedAt: r.published_at, publishedRevision: r.revision },
      }),
    );
  }

  async listSites(): Promise<string[]> {
    let q = this.db.from('facilities').select('id, name').eq('company_id', this.companyId);
    if (this.onlySite) q = q.eq('id', this.onlySite);
    const rows = check(await q.order('name')) as { id: string; name: string }[];
    return rows.map((r) => r.name);
  }

  async getMap(id: string): Promise<MapDocument | null> {
    const row = check(await this.db.from('maps').select(MAP_COLUMNS).eq('id', id).is('deleted_at', null).maybeSingle()) as MapRow | null;
    return row ? toDoc(row) : null;
  }

  /** Finds the company's site by name, creating it when allowed (owners and regional managers). */
  async siteId(name: string): Promise<string> {
    const site = name.trim();
    // Two sites can share a name, so take the oldest rather than failing on "multiple rows".
    const found = check(
      await this.db.from('facilities').select('id').eq('company_id', this.companyId).eq('name', site).order('created_at').limit(1),
    ) as { id: string }[];
    if (found.length) return found[0].id;
    const r = await this.db.from('facilities').insert({ company_id: this.companyId, name: site }).select('id').single();
    if (r.error) throw new Error(/row-level security/i.test(r.error.message) ? `You can’t add a new site. Pick one of your sites or ask your admin to add “${site}”.` : r.error.message);
    return (r.data as { id: string }).id;
  }

  async createMap(doc: MapDocument, site?: string, slot?: number): Promise<MapDocument> {
    const facility_id = await this.siteId(site?.trim() || doc.name);
    const id = crypto.randomUUID();
    // The database picks the slot (the asked-for one if it is free) and refuses a sixth map.
    const row = check(
      await this.db.from('maps').insert({ id, facility_id, name: doc.name, draft: { ...doc, id }, slot: slot ?? null }).select(MAP_COLUMNS).single(),
    ) as unknown as MapRow;
    return toDoc(row);
  }

  async saveMap(doc: MapDocument, baseRevision: number): Promise<MapDocument> {
    // The revision check happens in the database: the update matches nothing if
    // someone else saved first, and the trigger bumps the revision on success.
    const r = check(
      await this.db.from('maps').update({ name: doc.name, draft: doc }).eq('id', doc.id).eq('revision', baseRevision).is('deleted_at', null).select(MAP_COLUMNS),
    ) as unknown as MapRow[];
    if (r.length) return toDoc(r[0]);
    const current = await this.getMap(doc.id);
    if (!current)
      throw new MapGoneError('This map was deleted, or you no longer have access to it, so your latest changes couldn’t be saved. They are kept in this browser: restore the map from “Recently deleted”, then open it again to recover them.');
    throw new ConflictError(current);
  }

  async moveToSite(id: string, site: string): Promise<void> {
    if (!site.trim()) throw new Error('Enter a site name.');
    const facility_id = await this.siteId(site);
    changed(await this.db.from('maps').update({ facility_id }).eq('id', id).select('id'));
  }

  async publishMap(id: string): Promise<PublishInfo> {
    check(await this.db.rpc('publish_map', { p_map: id }));
    const info = await this.getPublishInfo(id);
    if (!info) throw new Error('Publishing didn’t complete. Try again.');
    return info;
  }

  async unpublishMap(id: string): Promise<void> {
    check(await this.db.rpc('unpublish_map', { p_map: id }));
  }

  async getPublishInfo(id: string): Promise<PublishInfo | null> {
    const r = check(await this.db.from('published_maps').select('published_at, revision').eq('map_id', id).maybeSingle()) as
      | { published_at: string; revision: number }
      | null;
    return r ? { publishedAt: r.published_at, publishedRevision: r.revision } : null;
  }

  async getPublishedMap(id: string): Promise<(MapDocument & { publishedAt: string }) | null> {
    const r = check(await this.db.from('published_maps').select('map_id, name, doc, revision, published_at').eq('map_id', id).maybeSingle()) as
      | { map_id: string; name: string; doc: MapDocument; revision: number; published_at: string }
      | null;
    if (!r) return null;
    return { ...migrateDocument({ ...r.doc, id: r.map_id, name: r.name, revision: r.revision, updatedAt: r.published_at }), publishedAt: r.published_at };
  }

  async trashMap(id: string): Promise<void> {
    changed(await this.db.from('maps').update({ deleted_at: new Date().toISOString() }).eq('id', id).select('id'));
  }

  async restoreMap(id: string): Promise<void> {
    changed(await this.db.from('maps').update({ deleted_at: null }).eq('id', id).select('id'));
  }

  async purgeMap(id: string): Promise<void> {
    changed(await this.db.from('maps').delete().eq('id', id).select('id'));
  }

  /** Expired trash is removed by a scheduled server job (purge_expired_trash), not by browsers. */
  async purgeExpiredTrash(): Promise<number> {
    return 0;
  }

  async saveVersion(doc: MapDocument, reason: VersionReason, label?: string): Promise<VersionMeta> {
    const row = check(
      await this.db
        .from('map_versions')
        .insert({ map_id: doc.id, reason, label: (label ?? LABELS[reason]).slice(0, 120), revision: doc.revision, doc })
        .select('id, map_id, created_at, reason, label, revision')
        .single(),
    ) as { id: string; map_id: string; created_at: string; reason: VersionReason; label: string; revision: number };
    return { id: row.id, mapId: row.map_id, createdAt: row.created_at, reason: row.reason, label: row.label, revision: row.revision };
  }

  async listVersions(mapId: string): Promise<VersionMeta[]> {
    const rows = check(
      await this.db.from('map_versions').select('id, map_id, created_at, reason, label, revision').eq('map_id', mapId).order('created_at', { ascending: false }).limit(200),
    ) as { id: string; map_id: string; created_at: string; reason: VersionReason; label: string; revision: number }[];
    return rows.map((r) => ({ id: r.id, mapId: r.map_id, createdAt: r.created_at, reason: r.reason, label: r.label, revision: r.revision }));
  }

  async getVersion(versionId: string): Promise<MapDocument | null> {
    const r = check(await this.db.from('map_versions').select('map_id, doc').eq('id', versionId).maybeSingle()) as { map_id: string; doc: MapDocument } | null;
    return r ? migrateDocument({ ...r.doc, id: r.map_id }) : null;
  }
}
