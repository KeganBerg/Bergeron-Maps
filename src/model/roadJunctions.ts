/**
 * Road junctions: which areas of merged roads are intersections, and where
 * their stop lines go. Re-exported from roads.ts.
 */
import { insideRings, intersectRings, ringsArea, unionRings, type Ring } from './shape';
import { RAYS, type RoadEnd, type RoadPiece, STOP_LINE, STOP_TRIM, endKey, march, matchedEnd, pointOnEnd, rayHits, swath } from './roads';

/** The part of straight piece `hit` (across its full width) that end `e`, carried on ahead, passes over. */
function slab(e: RoadEnd, hit: RoadPiece, road: Ring[]): Ring[] {
  const ax = hit.axis!, nr = [-ax[1], ax[0]];
  const u = (x: number, y: number) => x * ax[0] + y * ax[1];
  const v = (x: number, y: number) => x * nr[0] + y * nr[1];
  let v0 = Infinity, v1 = -Infinity;
  for (const r of hit.body) for (let i = 0; i < r.length; i += 2) {
    v0 = Math.min(v0, v(r[i], r[i + 1]));
    v1 = Math.max(v1, v(r[i], r[i + 1]));
  }
  const us: number[] = [];
  const dv = v(e.out[0], e.out[1]), du = u(e.out[0], e.out[1]);
  for (const [x, y] of [[e.seg[0], e.seg[1]], [e.seg[2], e.seg[3]]]) {
    us.push(u(x, y));
    // Where this corner's line crosses each side of the road.
    if (Math.abs(dv) > 1e-6) for (const side of [v0, v1]) us.push(u(x, y) + (du * (side - v(x, y))) / dv);
  }
  const u0 = Math.min(...us), u1 = Math.max(...us);
  const at = (a: number, b: number) => [ax[0] * a + nr[0] * b, ax[1] * a + nr[1] * b];
  return intersectRings([[...at(u0, v0), ...at(u1, v0), ...at(u1, v1), ...at(u0, v1)]], road);
}

/** Points along a ring's edges, about every `step` px. */
function samplePerimeter(r: Ring, step: number): Sample[] {
  const out: Sample[] = [];
  const n = r.length / 2;
  for (let i = 0; i < n; i++) {
    const x1 = r[i * 2], y1 = r[i * 2 + 1];
    const x2 = r[((i + 1) % n) * 2], y2 = r[((i + 1) % n) * 2 + 1];
    const len = Math.hypot(x2 - x1, y2 - y1);
    if (len < 1e-6) continue;
    const k = Math.max(1, Math.round(len / step));
    for (let j = 0; j < k; j++) {
      const t = (j + 0.5) / k;
      out.push({ x: x1 + (x2 - x1) * t, y: y1 + (y2 - y1) * t, nx: -(y2 - y1) / len, ny: (x2 - x1) / len });
    }
  }
  return out;
}

/**
 * Stretches of a junction's outline where road carries on beyond it (the
 * arms), as straight runs of points just outside the junction.
 */
type Sample = { x: number; y: number; nx: number; ny: number };

function armRuns(area: Ring[], road: Ring[], minLen: number): Sample[][] {
  const runs: Sample[][] = [];
  for (const r of area) {
    const pts = samplePerimeter(r, 2);
    if (!pts.length) continue;
    // Point each normal out of the junction.
    const flags = pts.map((p) => {
      const s = insideRings(area, p.x + p.nx * 0.5, p.y + p.ny * 0.5) ? -1 : 1;
      p.nx *= s;
      p.ny *= s;
      const px = p.x + p.nx * 3, py = p.y + p.ny * 3;
      return insideRings(road, px, py) && !insideRings(area, px, py);
    });
    // Start the walk at a break, so a run never wraps around the start.
    const start = flags.findIndex((f, i) => !f || turned(pts, i));
    if (start < 0) continue;
    let cur: Sample[] = [];
    const flush = () => {
      if (cur.length >= 2) {
        const a = cur[0], b = cur[cur.length - 1];
        if (Math.hypot(b.x - a.x, b.y - a.y) >= minLen) runs.push(cur);
      }
      cur = [];
    };
    for (let k = 0; k < pts.length; k++) {
      const i = (start + k) % pts.length;
      if (!flags[i] || (cur.length && turned(pts, i))) flush();
      if (flags[i]) cur.push(pts[i]);
    }
    flush();
  }
  return runs;
}

/** Does the outline turn a corner between sample i-1 and sample i? */
function turned(pts: { nx: number; ny: number }[], i: number): boolean {
  const a = pts[(i - 1 + pts.length) % pts.length], b = pts[i];
  return a.nx * b.nx + a.ny * b.ny < 0.87;
}

/**
 * The arms of one junction that get a stop bar. At a T (or wherever a road
 * runs straight through and others join it from the side) the through road
 * keeps going without bars and only the joining roads stop, as painted on a
 * real street or a parking lot's main drive aisle. Where every arm has one
 * across from it (a crossroads), every arm stops.
 */
function throughArms(runs: Sample[][], bendOf: (number | null)[] = []): boolean[] {
  const info = runs.map((r) => {
    const a = r[0], b = r[r.length - 1];
    const nx = (a.nx + b.nx) / 2, ny = (a.ny + b.ny) / 2;
    // Extent across the arm (along the junction edge).
    const ta = -a.x * ny + a.y * nx, tb = -b.x * ny + b.y * nx;
    return { nx, ny, lo: Math.min(ta, tb), hi: Math.max(ta, tb) };
  });
  const through = info.map((p, i) =>
    info.some((q, j) => {
      // Roughly opposite: a through road may bend a little where a road joins it.
      if (j === i || p.nx * q.nx + p.ny * q.ny > -THROUGH_BEND) return false;
      // q's extent measured on p's axis is reversed, since its normal points the other way.
      const lo = Math.max(p.lo, -q.hi), hi = Math.min(p.hi, -q.lo);
      return hi - lo > 0.5 * Math.min(p.hi - p.lo, q.hi - q.lo);
    }),
  );
  // A road ending against the side of a bend: nothing lies straight across,
  // but the bend itself carries on through the junction (both of its arms
  // leave it), so the bend is the through road and only the other road stops.
  if (!through.some(Boolean)) {
    bendOf.forEach((b, i) => {
      if (b !== null && bendOf.some((c, j) => j !== i && c === b)) through[i] = true;
    });
  }
  // Every arm has one across from it: a crossroads, where every arm stops.
  return through.every(Boolean) ? through.map(() => false) : through;
}

/** Cosine of the sharpest bend (about 40 degrees) a road may take and still run straight through a junction. */
const THROUGH_BEND = 0.76;

export interface Junctions {
  /** Intersection areas: centre lines and arrows stop here. */
  areas: Ring[];
  /** Stop bars, as two-point lines (drawn STOP_LINE.width wide). */
  stops: Ring[];
  /** Each intersection, with the pieces of the road running straight through it (their centre lines carry on across). */
  each: { ring: Ring; through: Set<number> }[];
}

/**
 * Finds intersections in a merged road: places where three or more arms
 * meet (a T, a crossroads, or a road meeting a bend). A road simply
 * continuing, or turning a corner, is not an intersection.
 */
export function roadJunctions(pieces: RoadPiece[], road: Ring[], joined: Set<string> = new Set()): Junctions {
  const candidates: Ring[][] = [];
  pieces.forEach((p, i) => {
    const others = pieces.filter((_, j) => j !== i);
    const otherBodies = unionRings(others.flatMap((o) => o.body));
    for (const [ei, e] of p.ends.entries()) {
      if (joined.has(endKey(i, ei)) || matchedEnd(e, others)) continue;
      const [mx, my] = pointOnEnd(e, 0.5);
      // How far the road goes on beyond this end, and how wide the road it meets is.
      const exit = march([road], mx, my, e.out, 800, 'out') ?? 800;
      const hits = rayHits(e, others.map((o) => o.body), exit + 1);
      if (!hits) continue;
      const near = Math.min(...hits);
      const k = hits.indexOf(near);
      const [sx, sy] = pointOnEnd(e, RAYS[k]);
      const hit = others.find((o) => insideRings(o.body, sx + e.out[0] * (near + 1), sy + e.out[1] * (near + 1)));
      // Running into a road going the same way is the road carrying on (it may be wider), not a junction.
      if (hit?.axis && Math.abs(hit.axis[0] * e.out[1] - hit.axis[1] * e.out[0]) < 0.1) continue;
      // A straight road is crossed at its width past where it starts. A bend met
      // from its outside (a road lined up with the bend's other arm) becomes part
      // of the junction all the way through, so no curved centre line is left
      // running across it.
      let depth = near + Math.max(p.width, hit?.width ?? 0) + 8;
      if (hit && !hit.axis) {
        // Right across the bend at every point of the end (its far side is curved),
        // so no sliver of it is left beside the junction as a fourth arm.
        depth = Math.max(...RAYS.map((t, r) => {
          const [x, y] = pointOnEnd(e, t);
          const h = hits[r] + 1;
          if (!insideRings(hit.body, x + e.out[0] * h, y + e.out[1] * h)) return 0;
          return h + (march([hit.body], x + e.out[0] * h, y + e.out[1] * h, e.out, 800, 'out') ?? 0);
        }), near + 1);
      }
      if (hit && !hit.axis) {
        // The bend's far side is curved, so how far the road goes on differs across the end.
        const exits = RAYS.map((t) => {
          const [x, y] = pointOnEnd(e, t);
          return march([road], x, y, e.out, 800, 'out') ?? 800;
        });
        depth = Math.min(Math.max(...exits), depth);
      } else depth = Math.min(exit, depth);
      let ahead = intersectRings([swath(e, 0, depth)], road);
      if (ringsArea(ahead) < p.width * Math.min(depth, p.width) * 0.25) continue;
      // Joining a straight road at a slant: the junction is the stretch of that
      // road the joining one covers, cut square to it, so the road running
      // through has clean, matching arms on both sides.
      if (hit?.axis && Math.abs(hit.axis[0] * e.out[0] + hit.axis[1] * e.out[1]) > 0.2) ahead = unionRings([...slab(e, hit, road), ...ahead]);
      const behind = intersectRings([swath(e, -p.width, 0)], otherBodies);
      // A road joining at a slant runs into the other road one corner first: the
      // junction reaches back until all of it is clear, so its stop bar goes
      // straight across it there instead of along the other road's edge.
      const backs = RAYS.map((t) => {
        const [x, y] = pointOnEnd(e, t);
        return march([otherBodies], x, y, [-e.out[0], -e.out[1]], p.width * 2, 'out') ?? 0;
      });
      const back = Math.max(...backs);
      const clear = back > 2 && Math.max(...backs) - Math.min(...backs) > 2 ? intersectRings([swath(e, -back, 0)], road) : [];
      candidates.push(unionRings([...ahead, ...behind, ...clear]));
    }
    // Crossings: two pieces overlapping away from either one's ends.
    for (let j = i + 1; j < pieces.length; j++) {
      const q = pieces[j];
      const both = intersectRings(p.body, q.body);
      if (ringsArea(both) < 1) continue;
      const endInside = [...p.ends, ...q.ends].some((e) => [0.1, 0.5, 0.9].some((t) => insideRings(both, ...pointOnEnd(e, t))));
      if (!endInside) candidates.push(both);
    }
  });

  const minW = Math.min(...pieces.map((p) => p.width));
  const junctions = candidates.filter((area) => armRuns(area, road, minW * 0.3).length >= 3);
  if (!junctions.length) return { areas: [], stops: [], each: [] };
  const areas = unionRings(junctions.flat());
  const stops: Ring[] = [];
  const each: Junctions['each'] = [];
  for (const ring of areas) {
    const runs = armRuns([ring], road, minW * 0.3);
    // The bend (if any) each arm carries on into.
    const bendOf = runs.map((run) => {
      const m = run[Math.floor(run.length / 2)];
      const owners = pieces.flatMap((p, i) => ([4, minW * 0.4].some((d) => insideRings(p.body, m.x + m.nx * d, m.y + m.ny * d)) ? [i] : []));
      return owners.length === 1 && !pieces[owners[0]].axis ? owners[0] : null;
    });
    const through = throughArms(runs, bendOf);
    const pass = new Set<number>();
    runs.forEach((run, k) => {
      if (!through[k]) return;
      const m = run[Math.floor(run.length / 2)];
      pieces.forEach((p, i) => {
        // Just past the junction may still be a bend's rounded corner, so look a little further too.
        if ([4, minW * 0.4].some((d) => insideRings(p.body, m.x + m.nx * d, m.y + m.ny * d))) pass.add(i);
      });
    });
    each.push({ ring, through: pass });
    for (const run of runs.filter((_, k) => !through[k])) {
    const a = run[0], b = run[run.length - 1];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const ux = (b.x - a.x) / len, uy = (b.y - a.y) / len;
    // Stop short of the road's painted edge lines.
    const trim = STOP_TRIM;
    const nx = (a.nx + b.nx) / 2, ny = (a.ny + b.ny) / 2;
    const o = STOP_LINE.offset;
    stops.push([a.x + ux * trim + nx * o, a.y + uy * trim + ny * o, b.x - ux * trim + nx * o, b.y - uy * trim + ny * o]);
    }
  }
  return { areas, stops, each };
}
