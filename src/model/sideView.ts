/**
 * The side view (cross-section) of a site's floors: every floor stacked as a
 * slab, the ramps, stairs and elevators between them where they really are,
 * and the found space or the route across floors. Pure data, drawn by
 * viewer/SideView.tsx in the app and by scripts/site-demo.ts on the website,
 * so the website shows exactly what the app shows.
 *
 * Positions across the drawing (x) are fractions 0..1 of the floors' combined
 * width, looked at from the south (the map's left is the drawing's left).
 */
import { connectorKind, isConnector, reaches, type PortalKind, type Route } from './route';
import type { Floor, MapDocument, MapObject } from './types';

export interface SideFloor {
  id: string;
  name: string;
  /** Index in the floor group: picks the floor's color, the same as the floor buttons. */
  colorIndex: number;
  /** Below the ground line (a basement, parking level P1 below ground, "Lower level"…). */
  below: boolean;
  spaces: number;
  /** Stretches of the floor with parking spaces on them, [from, to] in 0..1. */
  parked: [number, number][];
}

export interface SideLink {
  kind: Exclude<PortalKind, 'walkway' | 'inside' | 'outside'>;
  /** Left and right edges, 0..1. */
  x0: number;
  x1: number;
  /** Lowest and highest level (positions in `floors`, 0 = bottom) it reaches. */
  from: number;
  to: number;
  name: string;
}

export interface SideMark {
  level: number;
  x: number;
  /** "3C21 · Floor 3 · North stairs" */
  text: string;
  space: boolean;
}

export interface SideRoute {
  /** [x, level] points, walking along floors and climbing at the connectors used. */
  points: [number, number][];
}

export interface SideViewModel {
  /** Bottom to top. */
  floors: SideFloor[];
  links: SideLink[];
  /** Levels below this are underground (0 = no basements). */
  ground: number;
  mark?: SideMark;
  route?: SideRoute;
}

const BASEMENT = /^(b\s*-?\d+|basement|sub-?level|lower level|ll\s*\d*|p\s*-\s*\d+|level\s*-\d+|-\d+|underground)/i;
/** "B2" sits under "B1". */
const depth = (name: string) => Number(name.match(/\d+/)?.[0] ?? 1);

export const isBasement = (name: string) => BASEMENT.test(name.trim());

/** Left and right edge of an object, allowing for rotation. */
function span(o: MapObject): [number, number] {
  const r = ((o.rotation % 180) + 180) % 180;
  const a = (r * Math.PI) / 180;
  const half = (Math.abs(Math.cos(a)) * o.width + Math.abs(Math.sin(a)) * o.height) / 2;
  return [o.x - half, o.x + half];
}

/** Floors bottom to top: basements (deepest first) under the rest, which keep the order they have in the editor. */
export function stackFloors(group: Floor[]): Floor[] {
  const below = group.filter((f) => isBasement(f.name)).sort((a, b) => depth(b.name) - depth(a.name));
  return [...below, ...group.filter((f) => !isBasement(f.name))];
}

export function sideView(doc: MapDocument, group: Floor[], opts: { focusId?: string; focusTitle?: string; route?: Route | null } = {}): SideViewModel {
  const stack = stackFloors(group);
  const levelOf = new Map(stack.map((f, i) => [f.id, i]));

  // One shared left-to-right scale for every floor, so things line up the way they do in the building.
  let lo = Infinity;
  let hi = -Infinity;
  for (const f of stack)
    for (const o of f.objects) {
      if (o.hidden) continue;
      const [a, b] = span(o);
      lo = Math.min(lo, a);
      hi = Math.max(hi, b);
    }
  if (!isFinite(lo)) { lo = 0; hi = 1; }
  const w = Math.max(1, hi - lo);
  const fx = (x: number) => Math.min(1, Math.max(0, (x - lo) / w));

  const floors: SideFloor[] = stack.map((f) => {
    const spaces = f.objects.filter((o) => o.kind === 'space' && !o.hidden);
    const ranges = spaces.map((o) => span(o).map(fx) as [number, number]).sort((a, b) => a[0] - b[0]);
    const parked: [number, number][] = [];
    for (const r of ranges) {
      const last = parked[parked.length - 1];
      if (last && r[0] <= last[1] + 0.02) last[1] = Math.max(last[1], r[1]);
      else parked.push([...r]);
    }
    return { id: f.id, name: f.name, colorIndex: group.indexOf(f), below: isBasement(f.name), spaces: spaces.length, parked };
  });

  // Connectors. The same ramp or shaft is drawn on each floor it serves; merge the copies.
  const links: SideLink[] = [];
  for (const f of stack) {
    const here = levelOf.get(f.id)!;
    for (const o of f.objects) {
      if (!isConnector(o) || o.hidden) continue;
      const kind = connectorKind(o.assetKey);
      if (kind === 'walkway' || kind === 'inside' || kind === 'outside') continue;
      const levels = [here, ...reaches(doc, f, o).map((t) => levelOf.get(t.id)).filter((l): l is number => l !== undefined)];
      if (levels.length < 2) continue;
      let [x0, x1] = span(o).map(fx);
      // Something seen end-on (a ramp running north to south) still needs to show.
      const min = kind === 'ramp' ? 0.08 : 0.025;
      if (x1 - x0 < min) { const c = (x0 + x1) / 2; x0 = Math.max(0, c - min / 2); x1 = Math.min(1, c + min / 2); }
      const name = o.name?.trim() || o.label?.trim() || '';
      const pairs: [number, number][] = kind === 'ramp'
        // A ramp climbs one floor at a time to each floor it reaches.
        ? levels.slice(1).map((l) => [Math.min(here, l), Math.max(here, l)])
        : [[Math.min(...levels), Math.max(...levels)]];
      for (const [from, to] of pairs) {
        const same = links.find((l) => l.kind === kind && l.x0 < x1 + 0.01 && x0 < l.x1 + 0.01
          && (kind === 'ramp' ? l.from === from && l.to === to : l.from <= to && from <= l.to));
        if (same) {
          same.from = Math.min(same.from, from);
          same.to = Math.max(same.to, to);
          if (kind !== 'ramp') { same.x0 = Math.min(same.x0, x0); same.x1 = Math.max(same.x1, x1); }
          if (!same.name) same.name = name;
        } else links.push({ kind, x0, x1, from, to, name });
      }
    }
  }

  const ground = floors.filter((f) => f.below).length;
  const model: SideViewModel = { floors, links, ground };

  // The found space (or place), with the nearest named stairs or elevator, the way people give directions.
  if (opts.focusId) {
    const f = stack.find((x) => x.objects.some((o) => o.id === opts.focusId));
    const o = f?.objects.find((x) => x.id === opts.focusId);
    if (f && o) {
      let near = '';
      let best = Infinity;
      for (const c of f.objects) {
        if (c === o || !isConnector(c) || c.hidden || !c.name?.trim()) continue;
        // People on foot head for stairs and elevators, so a ramp only counts when nothing else is near.
        const d = Math.hypot(c.x - o.x, c.y - o.y) * (connectorKind(c.assetKey) === 'ramp' ? 3 : 1);
        if (d < best) { best = d; near = c.name.trim(); }
      }
      const title = (o.kind === 'space' ? o.label : '') || opts.focusTitle || o.name || '';
      model.mark = {
        level: levelOf.get(f.id)!,
        x: fx(o.x),
        text: [title, f.name, near].filter(Boolean).join(' · '),
        space: o.kind === 'space',
      };
    }
  }

  // The route: along each floor, then up or down where it changes floors.
  const r = opts.route;
  if (r && r.legs.length) {
    const pts: [number, number][] = [];
    const add = (x: number, floorId: string) => {
      const l = levelOf.get(floorId);
      if (l === undefined) return;
      const last = pts[pts.length - 1];
      if (!last || last[0] !== x || last[1] !== l) pts.push([x, l]);
    };
    // Each walk along a floor, from where it starts to where it ends; the line between
    // two walks is the ramp (sloped) or the stairs or elevator (straight up) taken.
    for (const leg of r.legs) {
      if (leg.points.length < 2) continue;
      add(fx(leg.points[0]), leg.floorId);
      add(fx(leg.points[leg.points.length - 2]), leg.floorId);
    }
    const last = r.steps[r.steps.length - 1];
    if (last?.toFloorId) add(fx(last.x), last.toFloorId);
    if (pts.length >= 2) model.route = { points: pts };
  }

  return model;
}
