/** The viewer's walking-directions state, from asking where you are to the route on the map. */
import { findRoute, placeLabel, type Place, type Route } from '../model/route';
import type { MapDocument } from '../model/types';
import type { MapWords } from '../model/words';

export interface Goal { floorId: string; objectId: string; x: number; y: number; name: string }
export interface Start extends Place { name: string }
/** Directions, from asking where you are to the route on the map. */
export type Directions =
  | { stage: 'pick'; goal: Goal }
  | { stage: 'tap'; goal: Goal }
  | { stage: 'busy'; goal: Goal; start: Start }
  | { stage: 'route'; goal: Goal; start: Start; route: Route }
  | { stage: 'none'; goal: Goal; start: Start; reason: 'same' | 'none' };

/** Room the directions panel takes at the bottom of the map, so the route isn't hidden under it. */
export const sheetRoom = (h: number) => Math.min(Math.round(h * 0.5), 260);

/**
 * The directions on screen, worked out again: on a newer version of the map (the
 * line never runs through something just drawn, and a place that was removed ends
 * them), or in another language (the names and steps are reworded).
 */
export function redoDirections(doc: MapDocument, cur: Directions | null, avoidStairs: boolean, words: MapWords): Directions | null {
  if (!cur) return cur;
  const find = (fid: string, id?: string) => (id ? doc.floors.find((f) => f.id === fid)?.objects.find((o) => o.id === id) : undefined);
  const goal = find(cur.goal.floorId, cur.goal.objectId);
  if (!goal) return null;
  const g = { ...cur.goal, x: goal.x, y: goal.y, name: placeLabel(goal, words) };
  if (!('start' in cur)) return { ...cur, goal: g };
  const so = cur.start.objectId ? find(cur.start.floorId, cur.start.objectId) : undefined;
  if (cur.start.objectId && !so) return { stage: 'pick', goal: g };
  const start = so ? { ...cur.start, x: so.x, y: so.y, name: placeLabel(so, words) } : { ...cur.start, name: words.spot };
  const r = findRoute(doc, start, g, { avoidStairs, words });
  return r.ok ? { stage: 'route', goal: g, start, route: r.route } : { stage: 'none', goal: g, start, reason: r.reason };
}
