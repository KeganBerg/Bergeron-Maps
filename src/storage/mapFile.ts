import { ASSET_BY_KEY } from '../assets/library';
import { newId } from '../model/ids';
import { migrateDocument } from '../model/migrate';
import type { MapDocument } from '../model/types';

/**
 * Map files let a manager move a map between browsers or devices, keep an
 * offline backup, or load a map someone else built (for example from a
 * paper sketch) before accounts and cloud storage exist.
 */
export const MAP_FILE_FORMAT = 'bergeron-maps/map';
export const MAP_FILE_EXTENSION = '.bmap.json';
/** Largest map file accepted on import (background images are embedded). */
export const MAX_MAP_FILE_BYTES = 25 * 1024 * 1024;

interface MapFile {
  format: typeof MAP_FILE_FORMAT;
  exportedAt: string;
  map: MapDocument;
}

export function serializeMapFile(doc: MapDocument, now = new Date()): string {
  const file: MapFile = { format: MAP_FILE_FORMAT, exportedAt: now.toISOString(), map: doc };
  return JSON.stringify(file);
}

export function mapFileName(doc: Pick<MapDocument, 'name'>): string {
  const base = doc.name.trim().replace(/[^\w\- ]+/g, '').replace(/\s+/g, '-').slice(0, 60) || 'map';
  return `${base}${MAP_FILE_EXTENSION}`;
}

const finite = (v: unknown) => typeof v === 'number' && Number.isFinite(v);

/**
 * Reads a map file and returns a new map ready to store: it always gets a
 * fresh id and revision so importing never overwrites an existing map.
 * Throws an Error with a message suitable for showing to the user.
 */
export function parseMapFile(text: string, now = new Date()): MapDocument {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('This file is not a Bergeron Maps map file.');
  }
  const wrapped = raw as Partial<MapFile> | null;
  const candidate = wrapped && typeof wrapped === 'object' && wrapped.format === MAP_FILE_FORMAT ? wrapped.map : raw;
  const doc = migrateDocument(candidate);
  if (typeof doc.name !== 'string') throw new Error('This file is not a valid map.');
  if (doc.floors.length === 0) throw new Error('This map has no floors.');
  for (const f of doc.floors) {
    if (typeof f.id !== 'string' || typeof f.name !== 'string' || !Array.isArray(f.layers) || f.layers.length === 0)
      throw new Error('This file is not a valid map.');
    const layerIds = new Set(f.layers.map((l) => l.id));
    for (const o of f.objects) {
      const geometryOk = ['x', 'y', 'width', 'height', 'rotation'].every((k) => finite((o as unknown as Record<string, unknown>)[k]));
      const kindOk =
        (o.kind === 'space' && typeof o.label === 'string') ||
        (o.kind === 'asset' && !!ASSET_BY_KEY[o.assetKey]) ||
        (o.kind === 'text' && typeof o.text === 'string');
      if (typeof o.id !== 'string' || !geometryOk || !kindOk || !layerIds.has(o.layerId))
        throw new Error(`Floor “${f.name}” has an object this version can’t read.`);
    }
  }
  const iso = now.toISOString();
  return { ...doc, id: newId('map'), revision: 0, createdAt: iso, updatedAt: iso };
}
