import { newId } from './ids';
import { SCHEMA_VERSION, type Floor, type Layer, type MapDocument } from './types';

export function defaultLayers(): Layer[] {
  // Bottom-to-top. Background is locked by default so it cannot be dragged by accident.
  return [
    { id: newId('ly'), name: 'Background image', visible: true, locked: true, role: 'background' },
    { id: newId('ly'), name: 'Structure', visible: true, locked: false, role: 'structure' },
    { id: newId('ly'), name: 'Parking spaces', visible: true, locked: false, role: 'spaces' },
    { id: newId('ly'), name: 'Landmarks', visible: true, locked: false, role: 'landmarks' },
    { id: newId('ly'), name: 'Labels & signs', visible: true, locked: false, role: 'labels' },
  ];
}

export function createFloor(name: string): Floor {
  return { id: newId('fl'), name, layers: defaultLayers(), objects: [], rows: {} };
}

export function createMap(name: string, now = new Date()): MapDocument {
  const iso = now.toISOString();
  return {
    id: newId('map'),
    schemaVersion: SCHEMA_VERSION,
    name: name.trim() || 'Untitled map',
    createdAt: iso,
    updatedAt: iso,
    revision: 0,
    floors: [createFloor('Floor 1')],
    settings: { gridSize: 10 },
  };
}

/** "Floor N" using the first N not already taken. */
export function nextFloorName(doc: MapDocument): string {
  const taken = new Set(doc.floors.map((f) => f.name.trim().toLowerCase()));
  let n = doc.floors.length + 1;
  while (taken.has(`floor ${n}`)) n++;
  return `Floor ${n}`;
}
