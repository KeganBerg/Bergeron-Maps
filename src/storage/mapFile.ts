import { ASSET_BY_KEY } from '../assets/library';
import { newId } from '../model/ids';
import { migrateDocument } from '../model/migrate';
import type { BackgroundImage, Floor, MapDocument, MapObject } from '../model/types';

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

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Positions and sizes beyond these can only come from a damaged file; the shape engine can't handle them. */
const MAX_COORD = 1_000_000;
const MAX_SIZE = 100_000;
const COLOR = /^#[0-9a-f]{3,8}$/i;
export const MAX_NAME_LENGTH = 80;

/**
 * Repairs the optional parts of an object that a hand-edited or damaged file
 * can get wrong, so a bad value is dropped (the library default is used)
 * instead of breaking the editor or the phone viewer.
 */
function repairObject(o: MapObject & Record<string, unknown>) {
  o.x = clamp(o.x, -MAX_COORD, MAX_COORD);
  o.y = clamp(o.y, -MAX_COORD, MAX_COORD);
  o.width = clamp(Math.abs(o.width), 1, MAX_SIZE);
  o.height = clamp(Math.abs(o.height), 1, MAX_SIZE);
  o.rotation %= 360;
  for (const k of ['fill', 'stroke'] as const) if (k in o && !(typeof o[k] === 'string' && COLOR.test(o[k] as string))) delete o[k];
  if ('fillOpacity' in o) finite(o.fillOpacity) ? (o.fillOpacity = clamp(o.fillOpacity, 0, 1)) : delete o.fillOpacity;
  if ('strokeWidth' in o) finite(o.strokeWidth) ? (o.strokeWidth = clamp(o.strokeWidth, 0, 100)) : delete o.strokeWidth;
  for (const k of ['corner', 'band', 'blend'] as const) if (k in o && !(finite(o[k]) && (o[k] as number) >= 0)) delete o[k];
  for (const k of ['name', 'label', 'imageSrc'] as const) if (k in o && o.kind !== 'space' && typeof o[k] !== 'string') delete o[k];
  if ('cuts' in o) {
    const cuts = Array.isArray(o.cuts) ? o.cuts.filter((c) => Array.isArray(c) && c.length >= 6 && c.length % 2 === 0 && c.every(finite)) : [];
    if (cuts.length) o.cuts = cuts;
    else delete o.cuts;
  }
  for (const k of ['hidden', 'locked'] as const) if (k in o && o[k] !== true) delete o[k];
  if ('connectsTo' in o && !(Array.isArray(o.connectsTo) && o.connectsTo.every((v) => typeof v === 'string'))) delete o.connectsTo;
  if ('symbol' in o && !(isObj(o.symbol) && typeof o.symbol.name === 'string' && typeof o.symbol.path === 'string')) delete o.symbol;
  if (o.kind === 'text') {
    o.fontSize = finite(o.fontSize) ? clamp(o.fontSize, 4, 400) : 16;
    if (!(typeof o.color === 'string' && COLOR.test(o.color))) o.color = '#111827';
  }
  if (o.kind === 'space' && !(typeof o.fill === 'string' && COLOR.test(o.fill))) o.fill = '#ffffff';
}

function repairBackground(f: Floor): BackgroundImage | undefined {
  const bg = f.background as unknown;
  if (!isObj(bg) || typeof bg.src !== 'string' || !['x', 'y', 'width', 'height'].every((k) => finite(bg[k]))) return undefined;
  const layerId = f.layers.some((l) => l.id === bg.layerId) ? (bg.layerId as string) : (f.layers.find((l) => l.role === 'background') ?? f.layers[0]).id;
  return {
    layerId,
    src: bg.src,
    x: clamp(bg.x as number, -MAX_COORD, MAX_COORD),
    y: clamp(bg.y as number, -MAX_COORD, MAX_COORD),
    width: clamp(Math.abs(bg.width as number), 1, MAX_SIZE),
    height: clamp(Math.abs(bg.height as number), 1, MAX_SIZE),
    opacity: finite(bg.opacity) ? clamp(bg.opacity, 0, 1) : 1,
    ...(typeof bg.fileName === 'string' ? { fileName: bg.fileName } : {}),
  };
}

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
  // Shape checks first, so a damaged file gets a plain message rather than a code error.
  const shaped = candidate as { floors?: unknown } | null;
  if (isObj(shaped) && Array.isArray(shaped.floors)) {
    for (const f of shaped.floors) {
      if (!isObj(f) || !Array.isArray(f.layers) || !f.layers.every(isObj) || ('objects' in f && !Array.isArray(f.objects)))
        throw new Error('This file is not a valid map.');
      if (Array.isArray(f.objects) && !f.objects.every(isObj)) throw new Error(`Floor “${String(f.name)}” has an object this version can’t read.`);
      if (!isObj(f.rows)) f.rows = {};
    }
  }
  const doc = migrateDocument(candidate);
  if (typeof doc.name !== 'string') throw new Error('This file is not a valid map.');
  if (doc.floors.length === 0) throw new Error('This map has no floors.');
  const floorIds = new Set<string>();
  for (const [i, f] of doc.floors.entries()) {
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
    // Repairs: two floors or objects sharing an id would make edits land on the wrong one.
    if (floorIds.has(f.id)) f.id = newId('floor');
    floorIds.add(f.id);
    f.name = f.name.trim().slice(0, MAX_NAME_LENGTH) || `Floor ${i + 1}`;
    for (const l of f.layers) {
      if (typeof l.name !== 'string' || !l.name.trim()) l.name = 'Layer';
      l.visible = l.visible !== false;
      l.locked = l.locked === true;
    }
    const objectIds = new Set<string>();
    for (const o of f.objects) {
      if (objectIds.has(o.id)) {
        o.id = newId('obj');
        if (o.kind === 'space') delete o.rowId;
      }
      objectIds.add(o.id);
      repairObject(o as MapObject & Record<string, unknown>);
    }
    const bg = repairBackground(f);
    if (bg) f.background = bg;
    else delete f.background;
  }
  doc.name = doc.name.trim().slice(0, MAX_NAME_LENGTH) || 'Imported map';
  doc.settings = { ...doc.settings, gridSize: finite(doc.settings?.gridSize) ? clamp(Math.round(doc.settings.gridSize), 1, 200) : 10 };
  const iso = now.toISOString();
  return { ...doc, id: newId('map'), revision: 0, createdAt: iso, updatedAt: iso };
}
