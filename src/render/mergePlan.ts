/**
 * Which objects on a layer merge into one drawn shape (grass, hedges, roads),
 * and the road markings, curbs and stop lines that go with each merge. Pure
 * geometry: MapObjects.tsx draws the result.
 */
import { ASSET_BY_KEY, defaultBlend, mergeKey, shapeSourceFor, type AssetDef } from '../assets/library';
import { bandWidth, cleanRings, filletInside, growRings, insetLines, insideRings, linesOutside, unionRings, localOutline, partEnds, mergeClusters, subtractRings, toLocal, toWorld, type Ring } from '../model/shape';
import { jointEnds, jointShapes, roadCenterLines, roadExtensions, roadJoints, roadJunctions, STOP_LINE, STOP_TRIM, type RoadEnd, type RoadPiece } from '../model/roads';
import { curveEnds, curveLine, curvePx } from '../model/curve';
import type { AssetObject, MapObject } from '../model/types';
import { MERGE_DECOR, MERGE_TEXTURE } from './mergeTextures';

/** Geometry for an object inside a merge: hedges merge as rounded strips. */
export function mergeSourceFor(def: AssetDef | undefined, o: AssetObject) {
  const src = shapeSourceFor(def, o);
  if (def && mergeKey(def) === 'hedge') return { ...src, corner: Math.max(0, Math.min(o.width, o.height) / 2 - 1) };
  return src;
}

/** How one member of a merge is drawn: hidden under the merge, its fill, or only its markings. */
export type MergedMode = 'ghost' | 'fill' | 'marks';

export interface MergeCluster {
  key: string;
  members: AssetObject[];
  rings: Ring[];
  /** Merged roads: the painted edge lines, as open polylines. */
  lines?: Ring[];
  /** Merged roads: stop bars at intersections. */
  stops?: Ring[];
  /** Merged roads: the double yellow centre lines, each line as an open polyline. */
  centers?: Ring[];
}

/** Road pieces painted with a double yellow centre line: the merged road paints it, so it can run on round bends and through junctions. */
const CENTER_LINE = new Set(['straight-road', 'curved-road']);

/** Paint line along a road's edge: inset from the edge, and its width (as drawn by each road piece). */
export const ROAD_EDGE = { inset: 3.5, width: 2 };

/** World outline of an object (with its curvature and cuts). */
function worldOutline(o: AssetObject): Ring[] {
  return localOutline(shapeSourceFor(ASSET_BY_KEY[o.assetKey], o)).map((r) => {
    const out: Ring = [];
    for (let i = 0; i < r.length; i += 2) out.push(...toWorld(o, r[i], r[i + 1]));
    return out;
  });
}

const ringsToLocal = (o: AssetObject, rings: Ring[]) =>
  rings.map((r) => {
    const out: Ring = [];
    for (let k = 0; k < r.length; k += 2) out.push(...toLocal(o, r[k], r[k + 1]));
    return out;
  });

/** A road piece in world coordinates: outline, open ends (where it continues) and width. */
function roadPiece(o: AssetObject): RoadPiece {
  const def = ASSET_BY_KEY[o.assetKey];
  const w = o.width, h = o.height;
  const arc = def?.outline === 'arc';
  // Intersections, roundabouts and turnarounds: roads join at the ends of their arms, which are `band` wide.
  const parts = def?.outline && !arc ? partEnds(def.outline, w, h, bandWidth({ width: w, height: h, band: o.band ?? def.band })) : null;
  const t = arc ? bandWidth({ width: w, height: h, band: o.band ?? def.band, curve: o.curve }) : parts ? bandWidth({ width: w, height: h, band: o.band ?? def!.band }) : h;
  const bent = arc ? curvePx(o, t) : null;
  const local = bent ? curveEnds(bent, t) : parts ?? [[0, 0, 0, h], [w, 0, w, h]];
  const body = worldOutline(o);
  const ends = local.map(([x1, y1, x2, y2]): RoadEnd => {
    const seg = [...toWorld(o, x1, y1), ...toWorld(o, x2, y2)];
    const len = Math.hypot(seg[2] - seg[0], seg[3] - seg[1]) || 1;
    let out: [number, number] = [-(seg[3] - seg[1]) / len, (seg[2] - seg[0]) / len];
    const mx = (seg[0] + seg[2]) / 2, my = (seg[1] + seg[3]) / 2;
    if (insideRings(body, mx + out[0], my + out[1])) out = [-out[0], -out[1]];
    return { seg, out };
  });
  const r = (o.rotation * Math.PI) / 180;
  // Centre line of straight and curved pieces (pieces made of arms have none).
  let spine: number[] | undefined;
  if (!parts) {
    const line = bent ? curveLine(bent) : [0, h / 2, w, h / 2];
    spine = [];
    for (let i = 0; i < line.length; i += 2) spine.push(...toWorld(o, line[i], line[i + 1]));
  }
  const center = CENTER_LINE.has(o.assetKey) ? spine : undefined;
  return { body, ends, width: t, axis: arc || parts ? undefined : [Math.cos(r), Math.sin(r)], center, spine };
}

/** In-line pieces whose centre lines are this close (map px) are lined up with each other. */
const MARK_ALIGN = 6;

/**
 * Where each road piece may show its own paint marks: its own outline, minus
 * every crossing piece of the same road and every intersection (so centre
 * lines and arrows stop at a junction instead of running across it). Pieces
 * lying in the same direction (a road built from straight pieces end to end)
 * keep their marks, only the first one paints where they overlap, and a
 * piece placed a few pixels off has its marks moved onto the first one's line.
 */
function roadMarks(members: AssetObject[], pieces: RoadPiece[], junction: Ring[]): { clips: Map<string, Ring[]>; shifts: Map<string, number> } {
  const straight = (m: AssetObject) => !ASSET_BY_KEY[m.assetKey]?.outline;
  const inLine = (a: AssetObject, b: AssetObject) => {
    if (!straight(a) || !straight(b)) return false;
    const d = (((a.rotation - b.rotation) % 180) + 180) % 180;
    return d < 3 || d > 177;
  };
  // Marks stop just before the stop bars.
  const stopZone = junction.length ? growRings(junction, STOP_LINE.offset + STOP_LINE.width / 2 + 1) : [];
  const clips = new Map<string, Ring[]>();
  const shifts = new Map<string, number>();
  members.forEach((m, i) => {
    // In-line pieces: the earlier piece paints the overlap, so the marks are never doubled up.
    const crossing = members.flatMap((o, j) => (j !== i && (j < i || !inLine(m, o)) ? pieces[j].body : []));
    clips.set(m.id, ringsToLocal(m, subtractRings(pieces[i].body, [...crossing, ...stopZone])));
    const a = (m.rotation * Math.PI) / 180;
    const n = [-Math.sin(a), Math.cos(a)];
    for (let j = 0; j < i; j++) {
      const o = members[j];
      if (!inLine(m, o) || Math.abs(o.height - m.height) > 1) continue;
      const d = (o.x - m.x) * n[0] + (o.y - m.y) * n[1];
      if (Math.abs(d) > 0.05 && Math.abs(d) <= MARK_ALIGN) {
        shifts.set(m.id, d + (shifts.get(o.id) ?? 0));
        break;
      }
      if (Math.abs(d) <= 0.05) break;
    }
  });
  return { clips, shifts };
}

/**
 * Pieces on one layer that merge: copies of the same ground or planting asset
 * (or any grass piece) that overlap or sit within their blend distance.
 * A piece on its own keeps its normal drawing.
 */
/**
 * Parking spaces on the floor, grown to cover the road paint beside them: a
 * row of spaces along a road is its edge, so the road's own edge line is left
 * off there instead of running as a second, broken line next to the row.
 */
function curbRings(curbs: MapObject[]): Ring[] {
  const rects: Ring[] = curbs.filter((o) => o.kind === 'space').map((o) => [
    ...toWorld(o, 0, 0), ...toWorld(o, o.width, 0), ...toWorld(o, o.width, o.height), ...toWorld(o, 0, o.height),
  ]);
  return rects.length ? growRings(unionRings(rects), CURB_REACH) : [];
}
/** How close (map px) road paint may come to a parking row before the row takes over as the edge. */
const CURB_REACH = ROAD_EDGE.inset + ROAD_EDGE.width + 1.5;

/** Stop bars stop short of the road's edge lines; where a row is the edge instead, they run on to meet it. */
function stopsToCurb(stops: Ring[], curb: Ring[]): Ring[] {
  if (!curb.length) return stops;
  return stops.map(([x1, y1, x2, y2]) => {
    const len = Math.hypot(x2 - x1, y2 - y1) || 1;
    const ux = (x2 - x1) / len, uy = (y2 - y1) / len;
    const reach = STOP_TRIM + 1;
    const a = insideRings(curb, x1, y1) ? [x1 - ux * reach, y1 - uy * reach] : [x1, y1];
    const b = insideRings(curb, x2, y2) ? [x2 + ux * reach, y2 + uy * reach] : [x2, y2];
    return [...a, ...b];
  });
}

export function mergePlan(objects: MapObject[], curbs: MapObject[] = []): {
  leads: Map<string, MergeCluster>;
  modes: Map<string, MergedMode>;
  clips: Map<string, Ring[]>;
  shifts: Map<string, number>;
} {
  const byKey = new Map<string, AssetObject[]>();
  for (const o of objects) {
    if (o.kind !== 'asset' || o.imageSrc || o.merge === false) continue;
    const def = ASSET_BY_KEY[o.assetKey];
    const key = def && mergeKey(def);
    if (!key) continue;
    byKey.set(key, [...(byKey.get(key) ?? []), o]);
  }
  const leads = new Map<string, MergeCluster>();
  const modes = new Map<string, MergedMode>();
  const clips = new Map<string, Ring[]>();
  const shifts = new Map<string, number>();
  let curb: Ring[] | null = null;
  for (const [key, objs] of byKey) {
    if (objs.length < 2) continue;
    const road = key === 'road';
    const pieces = road ? objs.map(roadPiece) : [];
    const joints = road ? roadJoints(pieces) : [];
    const joined = jointEnds(joints);
    const bends = road ? jointShapes(pieces, joints) : null;
    const extra = road ? roadExtensions(pieces, joined).map((e, i) => [...e, ...bends!.fill[i]]) : [];
    const clusters = mergeClusters(objs.map((m, i) => {
      const def = ASSET_BY_KEY[m.assetKey];
      return { x: m.x, y: m.y, rotation: m.rotation, blend: m.blend ?? defaultBlend(def), extra: extra[i], ...mergeSourceFor(def, m) };
    }));
    const mode: MergedMode = road ? 'marks' : MERGE_TEXTURE[key] || MERGE_DECOR[key] || key === 'hedge' ? 'ghost' : 'fill';
    for (const c of clusters) {
      if (c.members.length < 2) continue;
      const members = c.members.map((i) => objs[i]);
      const cluster: MergeCluster = { key, members, rings: c.rings };
      if (road) {
        const ps = c.members.map((i) => pieces[i]);
        // Joints and joined ends, numbered within this cluster.
        const at = new Map(c.members.map((m, k) => [m, k]));
        const js = joints.filter((j) => at.has(j.a) && at.has(j.b)).map((j) => ({ ...j, a: at.get(j.a)!, b: at.get(j.b)! }));
        const raw = bends!.trim.length ? subtractRings(c.rings, bends!.trim) : c.rings;
        curb ??= curbRings(curbs);
        const junctions = roadJunctions(ps, raw, jointEnds(js));
        
        // Inside corners of junctions and bends are rounded, like a kerb.
        const minW = Math.min(...ps.map((p) => p.width));
        const near = growRings([...junctions.areas, ...js.map((j) => [j.c[0] - minW, j.c[1] - minW, j.c[0] + minW, j.c[1] - minW, j.c[0] + minW, j.c[1] + minW, j.c[0] - minW, j.c[1] + minW])], minW);
        cluster.rings = filletInside(raw, minW * 0.25, near);
        cluster.rings = cleanRings(cluster.rings);
        const inBend = jointEnds(js);
        const open = ps.flatMap((p, k) => p.ends.filter((_, e) => !inBend.has(`${k}:${e}`)).map((e) => e.seg));
        cluster.lines = linesOutside(insetLines(cluster.rings, open, ROAD_EDGE.inset), curb);
        cluster.stops = stopsToCurb(junctions.stops, curb);
        cluster.centers = roadCenterLines(ps, js, junctions);
        for (const m of members) if (CENTER_LINE.has(m.assetKey)) modes.set(m.id, 'ghost');
        const marks = roadMarks(members, ps, junctions.areas);
        for (const [id, r] of marks.clips) clips.set(id, r);
        for (const [id, d] of marks.shifts) shifts.set(id, d);
      }
      leads.set(members[0].id, cluster);
      for (const m of members) if (!modes.has(m.id)) modes.set(m.id, mode);
    }
  }
  return { leads, modes, clips, shifts };
}
