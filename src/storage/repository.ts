import type { MapDocument } from '../model/types';

export interface MapSummary {
  id: string;
  name: string;
  updatedAt: string;
  floorCount: number;
  spaceCount: number;
  deletedAt?: string;
  /** The site (facility/location) this map belongs to. Maps are grouped by site. */
  site: string;
  revision: number;
  /** When employees last got a new version. Undefined = never published. */
  publishedAt?: string;
  /** Draft revision that was published; lower than `revision` means unpublished changes. */
  publishedRevision?: number;
  /** Numbered save slot at its site (1 to SITE_MAP_SLOTS). Missing for maps in the trash. */
  slot?: number;
}

export interface PublishInfo {
  publishedAt: string;
  publishedRevision: number;
}

export type VersionReason = 'auto' | 'manual' | 'before-restore' | 'conflict' | 'publish';

export interface VersionMeta {
  id: string;
  mapId: string;
  createdAt: string;
  reason: VersionReason;
  label: string;
  revision: number;
}

/** Thrown when the stored map changed since this editor last loaded or saved it. */
export class ConflictError extends Error {
  constructor(public readonly current: MapDocument) {
    super('This map was changed somewhere else since you opened it.');
    this.name = 'ConflictError';
  }
}

/** Thrown when saving a map that was deleted (for example in another tab) or that this account can no longer reach. */
export class MapGoneError extends Error {
  constructor(message = 'This map was deleted, so your latest changes couldn’t be saved. They are kept in this browser: restore the map from “Recently deleted”, then open it again to recover them.') {
    super(message);
    this.name = 'MapGoneError';
  }
}

export const TRASH_RETENTION_DAYS = 30;
/** Each site has this many numbered map slots. A map in the trash frees its slot. */
export const SITE_MAP_SLOTS = 5;
/** At most this many maps per site can be live (published) at once. */
export const SITE_LIVE_MAPS = 2;

export const slotsFullMessage = (site: string) =>
  `All ${SITE_MAP_SLOTS} map slots at “${site}” are in use. Delete one of its maps to free a slot.`;
export const liveFullMessage = (site: string) =>
  `“${site}” already has ${SITE_LIVE_MAPS} live maps, the most a site can have. Take one offline from the Sites page, then publish this one.`;

/** Lowest slot number not in `used`, or null when every slot is taken. */
export function firstFreeSlot(used: Iterable<number | undefined>, wanted?: number): number | null {
  const taken = new Set(used);
  if (wanted && wanted >= 1 && wanted <= SITE_MAP_SLOTS && !taken.has(wanted)) return wanted;
  for (let s = 1; s <= SITE_MAP_SLOTS; s++) if (!taken.has(s)) return s;
  return null;
}
export const MAX_AUTO_VERSIONS = 50;

/**
 * Storage boundary. Phase 1 ships a browser (IndexedDB) implementation; the
 * Phase 2 server implementation keeps this same contract and adds per-user
 * authorization on the server.
 */
export interface MapRepository {
  listMaps(): Promise<MapSummary[]>;
  listTrash(): Promise<MapSummary[]>;
  getMap(id: string): Promise<MapDocument | null>;
  /**
   * `site` defaults to the map name, so a one-map location needs no extra step.
   * `slot` asks for a particular free slot; otherwise the lowest free one is used.
   * Fails when all of the site's slots are in use.
   */
  createMap(doc: MapDocument, site?: string, slot?: number): Promise<MapDocument>;
  moveToSite(id: string, site: string): Promise<void>;
  /** Sites the person can add maps to, including ones without maps yet. */
  listSites?(): Promise<string[]>;
  /**
   * Makes the current saved draft what employees see. Drafts are never shown
   * to employees; they keep seeing the last published version until this runs.
   */
  publishMap(id: string): Promise<PublishInfo>;
  /** Takes the map offline: employees stop seeing it. The draft is kept. */
  unpublishMap(id: string): Promise<void>;
  getPublishInfo(id: string): Promise<PublishInfo | null>;
  /** The employee view. Null when the map was never published (or is deleted). */
  getPublishedMap(id: string): Promise<(MapDocument & { publishedAt: string }) | null>;
  /** Saves only if the stored revision still equals `baseRevision`; otherwise throws ConflictError. */
  saveMap(doc: MapDocument, baseRevision: number): Promise<MapDocument>;
  trashMap(id: string): Promise<void>;
  restoreMap(id: string): Promise<void>;
  purgeMap(id: string): Promise<void>;
  purgeExpiredTrash(now?: Date): Promise<number>;
  saveVersion(doc: MapDocument, reason: VersionReason, label?: string): Promise<VersionMeta>;
  listVersions(mapId: string): Promise<VersionMeta[]>;
  getVersion(versionId: string): Promise<MapDocument | null>;
}

export function summarize(doc: MapDocument, deletedAt?: string, extra: { site?: string; publish?: PublishInfo; slot?: number | null } = {}): MapSummary {
  return {
    slot: deletedAt ? undefined : extra.slot ?? undefined,
    site: extra.site?.trim() || doc.name,
    revision: doc.revision,
    publishedAt: extra.publish?.publishedAt,
    publishedRevision: extra.publish?.publishedRevision,
    id: doc.id,
    name: doc.name,
    updatedAt: doc.updatedAt,
    floorCount: doc.floors.length,
    spaceCount: doc.floors.reduce((n, f) => n + f.objects.filter((o) => o.kind === 'space').length, 0),
    deletedAt,
  };
}
