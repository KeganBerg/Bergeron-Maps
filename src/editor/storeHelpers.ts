/**
 * Small helpers shared by the editor store and the editor's components.
 * Re-exported from store.ts.
 */
import { objectBox, unionBoxes } from '../model/geometry';
import type { Box, Floor } from '../model/types';
import type { EditorState } from './storeTypes';

export const readPref = <T,>(k: string, fallback: T): T => {
  try {
    const v = localStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
};
export const writePref = (k: string, v: unknown) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* preferences are optional */
  }
};

export const currentFloor = (s: Pick<EditorState, 'doc' | 'floorId'>): Floor | undefined =>
  s.doc?.floors.find((f) => f.id === s.floorId) ?? s.doc?.floors[0];

/**
 * Makes a text box big enough for its words (it never shrinks one a person sized).
 * The box used to stay 120 wide, so "Administration office" was drawn as "Administratio".
 */
export function growTextBox(o: { text: string; fontSize: number; width: number; height: number; strokeWidth?: number; fill?: string }) {
  const charW = o.fontSize * 0.62;
  const pad = o.fill || (o.strokeWidth ?? 0) > 0 ? 8 : 0;
  const lines = o.text.split('\n');
  const longestWord = Math.max(0, ...o.text.split(/\s+/).map((w) => w.length)) * charW + pad;
  const longestLine = Math.max(0, ...lines.map((l) => l.length)) * charW + pad;
  const width = Math.min(Math.max(o.width, longestWord, Math.min(longestLine, 480)), 1000);
  const perLine = Math.max(1, (width - pad) / charW);
  const rows = lines.reduce((n, l) => n + Math.max(1, Math.ceil(l.length / perLine)), 0);
  o.width = Math.round(width);
  o.height = Math.round(Math.max(o.height, rows * o.fontSize * 1.15 + 6));
}

/** Objects that are locked or hidden, or on a locked or hidden layer, cannot be selected or edited. */
export function editableIds(floor: Floor, ids: Iterable<string>): string[] {
  const blocked = new Set(floor.layers.filter((l) => l.locked || !l.visible).map((l) => l.id));
  const set = new Set(ids);
  return floor.objects.filter((o) => set.has(o.id) && !o.locked && !o.hidden && !blocked.has(o.layerId)).map((o) => o.id);
}

/** Bounding box of the current selection (world units). */
export function selectionBox(floor: Floor, ids: string[]): Box | null {
  const set = new Set(ids);
  return unionBoxes(floor.objects.filter((o) => set.has(o.id)).map(objectBox));
}
