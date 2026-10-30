import type { MapDocument } from '../model/types';

export interface MapSummary {
  id: string;
  name: string;
  updatedAt: string;
  floorCount: number;
  spaceCount: number;
  deletedAt?: string;
}

export type VersionReason = 'auto' | 'manual' | 'before-restore' | 'conflict';

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

export const TRASH_RETENTION_DAYS = 30;
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
  createMap(doc: MapDocument): Promise<MapDocument>;
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

export function summarize(doc: MapDocument, deletedAt?: string): MapSummary {
  return {
    id: doc.id,
    name: doc.name,
    updatedAt: doc.updatedAt,
    floorCount: doc.floors.length,
    spaceCount: doc.floors.reduce((n, f) => n + f.objects.filter((o) => o.kind === 'space').length, 0),
    deletedAt,
  };
}
