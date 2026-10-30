import type { Floor, LayerRole, MapObject } from './types';
import { normalizeRows } from './rows';

export function layerObjectCount(floor: Floor, layerId: string): number {
  let n = floor.objects.filter((o) => o.layerId === layerId).length;
  if (floor.background?.layerId === layerId) n++;
  return n;
}

/**
 * Deletes a layer. Its objects are either moved to `moveTo` or deleted with it.
 * A floor always keeps at least one layer. Mutates `floor`.
 */
export function deleteLayer(floor: Floor, layerId: string, moveTo: string | null): void {
  if (floor.layers.length <= 1) return;
  floor.layers = floor.layers.filter((l) => l.id !== layerId);
  if (moveTo && floor.layers.some((l) => l.id === moveTo)) {
    for (const o of floor.objects) if (o.layerId === layerId) o.layerId = moveTo;
    if (floor.background?.layerId === layerId) floor.background.layerId = moveTo;
  } else {
    floor.objects = floor.objects.filter((o) => o.layerId !== layerId);
    if (floor.background?.layerId === layerId) delete floor.background;
    normalizeRows(floor);
  }
}

/** Moves a layer one step up (toward the top of the drawing) or down. Mutates `floor`. */
export function shiftLayer(floor: Floor, layerId: string, dir: 1 | -1): void {
  const i = floor.layers.findIndex((l) => l.id === layerId);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= floor.layers.length) return;
  [floor.layers[i], floor.layers[j]] = [floor.layers[j], floor.layers[i]];
}

/**
 * Chooses the layer for a new object. An explicitly chosen active layer wins
 * when it can accept objects; in "automatic" mode (or when the chosen layer is
 * locked, hidden or the background), objects go to the default layer for
 * their type, then to the topmost editable layer.
 */
export function resolveTargetLayer(floor: Floor, active: string | 'auto', role: LayerRole): string {
  const editable = floor.layers.filter((l) => !l.locked && l.visible && l.role !== 'background');
  if (active !== 'auto' && editable.some((l) => l.id === active)) return active;
  const byRole = editable.find((l) => l.role === role);
  if (byRole) return byRole.id;
  if (editable.length) return editable[editable.length - 1].id;
  return floor.layers[floor.layers.length - 1].id;
}

export function roleForObject(o: Pick<MapObject, 'kind'> & { assetKey?: string }, assetLayer?: LayerRole): LayerRole {
  if (o.kind === 'space') return 'spaces';
  if (o.kind === 'text') return 'labels';
  return assetLayer ?? 'landmarks';
}
