/**
 * Centre lines of merged roads: one painted line per road, carried through
 * bends and stopped short of junctions. Re-exported from roads.ts.
 */
import { growRings, intersectRings, linesOutside, subtractRings, unionRings, type Ring } from './shape';
import { type Junctions } from './roadJunctions';
import { type RoadJoint, type RoadPiece, STOP_LINE, cutLine, seam } from './roads';

/** In-line pieces whose centre lines are this close (map px) are lined up with each other. */
export const CENTER_ALIGN = 6;

function withEnd(c: { pts: [number, number][]; atStart: boolean }, more: [number, number][]): number[] {
  const pts = [...c.pts, ...more];
  if (c.atStart) pts.reverse();
  return pts.flat();
}

/** A polyline moved d px to one side, with mitred corners. */
export function offsetPolyline(l: number[], d: number): number[] {
  const n = l.length / 2;
  const seg: [number, number][] = [];
  for (let i = 0; i + 1 < n; i++) {
    const dx = l[i * 2 + 2] - l[i * 2], dy = l[i * 2 + 3] - l[i * 2 + 1];
    const len = Math.hypot(dx, dy) || 1;
    seg.push([-dy / len, dx / len]);
  }
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = seg[Math.max(0, i - 1)], b = seg[Math.min(seg.length - 1, i)];
    let nx = a[0] + b[0], ny = a[1] + b[1];
    const len = Math.hypot(nx, ny);
    if (len < 1e-6) [nx, ny] = b;
    else {
      nx /= len;
      ny /= len;
    }
    // Mitre: push the corner out so both sides stay d away, but never more than 3d.
    const k = Math.min(3, 1 / Math.max(1 / 3, nx * b[0] + ny * b[1]));
    out.push(l[i * 2] + nx * d * k, l[i * 2 + 1] + ny * d * k);
  }
  return out;
}

/** Joins polylines whose ends meet exactly (the two halves of a bend) into longer ones. */
function chain(lines: number[][]): number[][] {
  const out = lines.map((l) => [...l]);
  const same = (l: number[], i: number, m: number[], k: number) => Math.abs(l[i] - m[k]) < 1e-6 && Math.abs(l[i + 1] - m[k + 1]) < 1e-6;
  const rev = (l: number[]) => {
    const r: number[] = [];
    for (let i = l.length - 2; i >= 0; i -= 2) r.push(l[i], l[i + 1]);
    return r;
  };
  let joined = true;
  while (joined) {
    joined = false;
    for (let i = 0; i < out.length && !joined; i++)
      for (let j = i + 1; j < out.length && !joined; j++) {
        let a = out[i], b = out[j];
        const ea = a.length - 2, eb = b.length - 2;
        if (same(a, ea, b, 0)) out[i] = [...a, ...b.slice(2)];
        else if (same(a, ea, b, eb)) out[i] = [...a, ...rev(b).slice(2)];
        else if (same(a, 0, b, eb)) out[i] = [...b, ...a.slice(2)];
        else if (same(a, 0, b, 0)) out[i] = [...rev(b), ...a.slice(2)];
        else continue;
        out.splice(j, 1);
        joined = true;
        a = b = [];
      }
  }
  return out;
}

/**
 * The double yellow centre lines of a merged road, as pairs of world
 * polylines (each line of the pair drawn on its own). Lines run on round a
 * bend made of separate pieces, carry straight on through a T where the road
 * runs through, and stop short of the stop bars of roads that join it or meet
 * at a crossroads.
 */
export function roadCenterLines(pieces: RoadPiece[], joints: RoadJoint[], junctions: Junctions, gap = 2): number[][] {
  const lines = pieces.map((p) => (p.center ? [...p.center] : null));
  const partner = new Map<number, Set<number>>();
  const link = (a: number, b: number) => {
    partner.set(a, (partner.get(a) ?? new Set()).add(b));
    partner.set(b, (partner.get(b) ?? new Set()).add(a));
  };
  for (const j of joints) {
    link(j.a, j.b);
    const la = lines[j.a], lb = lines[j.b];
    if (!la || !lb) continue;
    if (j.near) {
      const m = seam(pieces, j);
      const A = cutLine(la, pieces[j.a].ends[j.ea], m.backA), B = cutLine(lb, pieces[j.b].ends[j.eb], m.backB);
      lines[j.a] = withEnd(A, m.line.slice(1, -1).concat([B.p]));
      lines[j.b] = withEnd(B, []);
      continue;
    }
    // Round the turn: each line stops short of the bend's centre and a curve joins them.
    const ea = pieces[j.a].ends[j.ea], eb = pieces[j.b].ends[j.eb];
    const r = Math.min(pieces[j.a].width, pieces[j.b].width) / 2;
    // Each line stops r short of the bend's centre, measured along the line
    // itself, so on a curved piece the turn starts on its line instead of on
    // the straight tangent beside it (which left a step in the yellow).
    const A = cutLine(la, ea, r - j.sa), B = cutLine(lb, eb, r - j.sb);
    const q0 = A.p, q2 = B.p;
    const turn: [number, number][] = [];
    for (let k = 1; k <= 12; k++) {
      const t = k / 12, u = 1 - t;
      turn.push(k === 12 ? q2 : [u * u * q0[0] + 2 * u * t * j.c[0] + t * t * q2[0], u * u * q0[1] + 2 * u * t * j.c[1] + t * t * q2[1]]);
    }
    lines[j.a] = withEnd(A, turn);
    lines[j.b] = withEnd(B, []);
  }
  // Straight pieces laid end to end along one road: a piece a few px off has its line moved onto the first one's.
  pieces.forEach((p, i) => {
    const l = lines[i];
    if (!l || !p.axis) return;
    const n = [-p.axis[1], p.axis[0]];
    for (let j = 0; j < i; j++) {
      const q = pieces[j], m = lines[j];
      if (!m || !q.axis || Math.abs(p.axis[0] * q.axis[1] - p.axis[1] * q.axis[0]) > 0.05) continue;
      const d = (m[0] - l[0]) * n[0] + (m[1] - l[1]) * n[1];
      if (Math.abs(d) > CENTER_ALIGN) continue;
      link(i, j);
      if (Math.abs(d) > 0.05) lines[i] = l.map((v, k) => v + n[k % 2] * d);
      break;
    }
  });
  const stopZone = (r: Ring) => growRings([r], STOP_LINE.offset + STOP_LINE.width / 2 + 1);
  const clipped: number[][] = [];
  pieces.forEach((p, i) => {
    const l = lines[i];
    if (!l) return;
    const passes = junctions.each.filter((x) => x.through.has(i)).map((x) => x.ring);
    const stop = junctions.each.filter((x) => !x.through.has(i)).flatMap((x) => stopZone(x.ring));
    // Where another piece (not one carrying this road on) lies over this one.
    const over = pieces.flatMap((q, j) => (j === i || partner.get(i)?.has(j) ? [] : intersectRings(p.body, q.body)));
    const clip = unionRings([...stop, ...(passes.length ? subtractRings(over, passes) : over)]);
    clipped.push(...linesOutside([l], clip));
  });
  return chain(clipped).flatMap((l) => [offsetPolyline(l, gap), offsetPolyline(l, -gap)]);
}
