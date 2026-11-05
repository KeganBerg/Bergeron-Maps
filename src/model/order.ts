import { boxesIntersect, objectBox } from './geometry';
import type { Floor, Layer, MapObject } from './types';

export type OrderOp = 'front' | 'forward' | 'backward' | 'back';

export interface OrderResult {
  /** Nothing changed: the selection was already at the front/back. */
  noop: boolean;
  /** The layer the selection moved to so it could go above/below something. */
  movedTo: Layer | null;
  /** A locked layer the selection could not move into. */
  blockedBy: Layer | null;
}

/**
 * Changes the drawing order of the selected objects.
 *
 * The map draws layer by layer (bottom to top), and inside a layer in array
 * order. So "on top of everything" can mean leaving the object's own layer:
 * when the object it has to pass sits on a higher layer, it moves to that
 * layer. Forward/backward step past the next object that actually overlaps
 * the selection, so every click visibly changes something.
 *
 * Mutates `floor`. Returned layers are plain copies, safe to use after an Immer draft closes.
 */
export function reorderObjects(floor: Floor, ids: string[], op: OrderOp): OrderResult {
  const result: OrderResult = { noop: true, movedTo: null, blockedBy: null };
  const sel = new Set(ids);
  const layerIdx = new Map(floor.layers.map((l, i) => [l.id, i]));
  const layerById = new Map(floor.layers.map((l) => [l.id, l]));
  const orphans = floor.objects.filter((o) => !layerIdx.has(o.layerId));
  const stack = floor.layers.flatMap((l) => floor.objects.filter((o) => o.layerId === l.id));
  const picked = stack.filter((o) => sel.has(o.id));
  if (!picked.length) return result;

  const before = stack.map((o) => `${o.id}@${o.layerId}`).join();
  const pos = new Map(stack.map((o, i) => [o.id, i]));
  const hidden = new Set(floor.layers.filter((l) => !l.visible).map((l) => l.id));
  const others = stack.filter((o) => !sel.has(o.id) && !hidden.has(o.layerId));
  const boxes = picked.map(objectBox);
  const overlapping = others.filter((o) => {
    const b = objectBox(o);
    return boxes.some((s) => boxesIntersect(s, b));
  });
  const relevant = overlapping.length ? overlapping : others;
  const li = (o: MapObject) => layerIdx.get(o.layerId)!;
  const canEnter = (l: Layer) => !l.locked && l.role !== 'background';

  /** The layer a selected object should end up on to pass `t` in direction `dir`. */
  const targetLayer = (o: MapObject, t: MapObject | undefined, dir: 1 | -1): string => {
    if (!t || (dir === 1 ? li(t) <= li(o) : li(t) >= li(o))) return o.layerId;
    const layer = layerById.get(t.layerId)!;
    if (!canEnter(layer)) {
      result.blockedBy = { ...layer };
      return o.layerId;
    }
    result.movedTo = { ...layer };
    return t.layerId;
  };

  const rest = stack.filter((o) => !sel.has(o.id));
  const insertAtLayerEdge = (o: MapObject, layerId: string, end: boolean) => {
    const idxs = rest.map((r, i) => (r.layerId === layerId ? i : -1)).filter((i) => i >= 0);
    let at: number;
    if (idxs.length) at = end ? idxs[idxs.length - 1] + 1 : idxs[0];
    else {
      // Empty layer: after every object on a lower layer.
      const k = layerIdx.get(layerId)!;
      at = rest.filter((r) => li(r) < k).length;
    }
    rest.splice(at, 0, o);
  };

  if (op === 'front' || op === 'back') {
    const t = op === 'front' ? relevant[relevant.length - 1] : relevant[0];
    const dir = op === 'front' ? 1 : -1;
    const moved = picked.map((o) => ({ ...o, layerId: targetLayer(o, t, dir) }));
    if (op === 'front') for (const o of moved) insertAtLayerEdge(o, o.layerId, true);
    else for (const o of [...moved].reverse()) insertAtLayerEdge(o, o.layerId, false);
  } else {
    const dir = op === 'forward' ? 1 : -1;
    const edge = dir === 1 ? Math.max(...picked.map((o) => pos.get(o.id)!)) : Math.min(...picked.map((o) => pos.get(o.id)!));
    const t = dir === 1 ? relevant.find((o) => pos.get(o.id)! > edge) : [...relevant].reverse().find((o) => pos.get(o.id)! < edge);
    if (!t) return result;
    const moved = picked.map((o) => ({ ...o, layerId: targetLayer(o, t, dir) }));
    const besideT = moved.filter((o) => o.layerId === t.layerId);
    const elsewhere = moved.filter((o) => o.layerId !== t.layerId);
    const ti = rest.indexOf(t);
    rest.splice(dir === 1 ? ti + 1 : ti, 0, ...besideT);
    // Objects that could not join t's layer go to the matching edge of their own layer.
    if (dir === 1) for (const o of elsewhere) insertAtLayerEdge(o, o.layerId, true);
    else for (const o of [...elsewhere].reverse()) insertAtLayerEdge(o, o.layerId, false);
  }

  const after = rest.map((o) => `${o.id}@${o.layerId}`).join();
  result.noop = before === after;
  if (result.noop) return { noop: true, movedTo: null, blockedBy: result.blockedBy };
  floor.objects = [...rest, ...orphans];
  return result;
}
