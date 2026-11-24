/** The viewer's walking-directions state, from asking where you are to the route on the map. */
import { type Place, type Route } from '../model/route';

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
