import { ASSET_BY_KEY } from '../../assets/library';
import { objectBox } from '../geometry';
import { buildingName, floorGroup, interiorFloors } from '../interiors';
import { toLocal, toWorld } from '../shape';
import type { AssetObject, Floor, MapDocument, MapObject } from '../types';
import { type End } from './places';
import { ENGLISH, type MapWords, symbolName } from '../words';

/**
 * Walking directions, part 4: how floors join. Stairs, elevators and ramps
 * join the floors they "Go to"; building entrances join a site map to the
 * floor plans inside.
 */

export type PortalKind = 'elevator' | 'stairs' | 'escalator' | 'ramp' | 'walkway' | 'inside' | 'outside';

export interface Portal {
  kind: PortalKind;
  a: End;
  b: End;
  name: string;
  penalty: number;
}

export function connectorKind(key: string): PortalKind {
  if (key.startsWith('elevator')) return 'elevator';
  if (key === 'escalator') return 'escalator';
  if (key.includes('ramp')) return 'ramp';
  if (key === 'walkway' || key === 'pedestrian-bridge') return 'walkway';
  return 'stairs';
}

export const isConnector = (o: MapObject): o is AssetObject => o.kind === 'asset' && !!ASSET_BY_KEY[o.assetKey]?.connector;

/** Floors a connector reaches. Older maps without "Goes to" use the floors next to it (any floor for elevators). */
export function reaches(doc: MapDocument, floor: Floor, o: AssetObject): Floor[] {
  if (o.connectsTo?.length) return o.connectsTo.map((id) => doc.floors.find((f) => f.id === id)).filter((f): f is Floor => !!f && f !== floor);
  const group = floorGroup(doc, floor);
  const i = group.indexOf(floor);
  if (connectorKind(o.assetKey) === 'elevator') return group.filter((f) => f !== floor);
  return [group[i - 1], group[i + 1]].filter((f): f is Floor => !!f);
}

export const nameOf = (o: MapObject, fallback: string, words: MapWords = ENGLISH) =>
  o.name?.trim() || (o.kind === 'asset' ? o.label?.trim() || symbolName(o.assetKey, words) : undefined) || fallback;

const portalsCache = new WeakMap<MapDocument, Portal[]>();

export function portals(doc: MapDocument): Portal[] {
  const hit = portalsCache.get(doc);
  if (hit) return hit;
  const out: Portal[] = [];
  const seen = new Set<string>();
  for (const f of doc.floors) {
    for (const o of f.objects) {
      if (!isConnector(o) || o.hidden) continue;
      const kind = connectorKind(o.assetKey);
      for (const to of reaches(doc, f, o)) {
        // On the other floor: the same kind of connector that comes back here, nearest to this one.
        let best: AssetObject | undefined;
        let bestD = Infinity;
        for (const y of to.objects) {
          if (!isConnector(y) || y.hidden || connectorKind(y.assetKey) !== kind) continue;
          if (!reaches(doc, to, y).includes(f)) continue;
          const d = Math.hypot(y.x - o.x, y.y - o.y);
          if (d < bestD) { bestD = d; best = y; }
        }
        const key = best ? [o.id, best.id].sort().join('|') : `${o.id}>${to.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const steps = Math.max(1, Math.abs(floorGroup(doc, to).indexOf(to) - floorGroup(doc, f).indexOf(f)));
        const penalty =
          kind === 'elevator' ? 150 + 30 * steps
          : kind === 'escalator' ? 150 * steps
          // A garage ramp is a long walk on a car's way: stairs and elevators first.
          : kind === 'ramp' ? Math.max(o.width, o.height) * 1.5 + 400 * steps
          : kind === 'walkway' ? 50
          : 250 * steps;
        out.push({
          kind,
          name: nameOf(o, ASSET_BY_KEY[o.assetKey]?.name ?? 'Stairs'),
          penalty,
          a: { floor: f, obj: o, x: o.x, y: o.y },
          b: best ? { floor: to, obj: best, x: best.x, y: best.y } : { floor: to, x: o.x, y: o.y, landing: { kind, name: nameOf(o, ASSET_BY_KEY[o.assetKey]?.name ?? 'Stairs'), of: o } },
        });
      }
    }
  }
  // Buildings with a floor plan inside: in through their entrances.
  for (const site of doc.floors) {
    if (site.interiorOf) continue;
    for (const b of site.objects) {
      if (b.kind !== 'asset') continue;
      const inside = interiorFloors(doc, b.id)[0];
      if (!inside) continue;
      const bb = objectBox(b);
      const grow = 30;
      const doors = site.objects.filter((d) => d.kind === 'asset' && !!ASSET_BY_KEY[d.assetKey]?.entersBuilding && !d.hidden &&
        d.x > bb.x - grow && d.x < bb.x + bb.width + grow && d.y > bb.y - grow && d.y < bb.y + bb.height + grow);
      const shell = inside.objects.find((o) => o.kind === 'asset' && o.assetKey === 'outer-walls');
      const frame = shell ?? null;
      const ib = frame ? objectBox(frame) : objectBox({ x: 0, y: 0, width: 1, height: 1, rotation: 0 });
      const innerDoors = inside.objects.filter((d) => d.kind === 'asset' && !!ASSET_BY_KEY[d.assetKey]?.entersBuilding && !d.hidden);
      const outsideDoors = frame
        ? innerDoors.filter((d) => {
            const [lx, ly] = toLocal(frame, d.x, d.y);
            return Math.min(lx, ly, frame.width - lx, frame.height - ly) < 40;
          })
        : innerDoors;
      const entries: End[] = doors.length ? doors.map((d) => ({ floor: site, obj: d, x: d.x, y: d.y })) : [{ floor: site, obj: b, x: b.x, y: b.y }];
      for (const e of entries) {
        // Where this entrance lands on the floor plan: the same spot around the building's outline.
        const [lx, ly] = toLocal(b, e.x, e.y);
        const u = Math.min(1, Math.max(0, lx / b.width)), v = Math.min(1, Math.max(0, ly / b.height));
        const [px, py] = frame ? toWorld(frame, u * frame.width, v * frame.height) : [ib.x + u * ib.width, ib.y + v * ib.height];
        let inner: MapObject | undefined;
        let bestD = Infinity;
        for (const d of outsideDoors) {
          const dd = Math.hypot(d.x - px, d.y - py);
          if (dd < bestD) { bestD = dd; inner = d; }
        }
        out.push({
          kind: 'inside',
          name: buildingName(b),
          penalty: 20,
          a: e,
          b: inner ? { floor: inside, obj: inner, x: inner.x, y: inner.y } : { floor: inside, x: px, y: py },
        });
      }
    }
  }
  portalsCache.set(doc, out);
  return out;
}
