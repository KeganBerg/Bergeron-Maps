import { objectBox, unionBoxes } from './geometry';
import type { Box, MapObject } from './types';

export type AlignOp = 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom';
export type DistributeOp = 'horizontal' | 'vertical';

interface Unit {
  ids: string[];
  box: Box;
}

/**
 * Selected objects move as units: every space of a row moves together when the
 * whole row is selected, so aligning two rows lines up the rows instead of
 * collapsing each row's spaces onto one spot.
 */
function units(objects: MapObject[]): Unit[] {
  const rows = new Map<string, MapObject[]>();
  const out: Unit[] = [];
  for (const o of objects) {
    if (o.kind === 'space' && o.rowId) {
      const list = rows.get(o.rowId) ?? [];
      list.push(o);
      rows.set(o.rowId, list);
    } else out.push({ ids: [o.id], box: objectBox(o) });
  }
  for (const list of rows.values()) out.push({ ids: list.map((o) => o.id), box: unionBoxes(list.map(objectBox))! });
  return out;
}

export type Moves = Map<string, { dx: number; dy: number }>;

function apply(us: Unit[], delta: (u: Unit) => { dx: number; dy: number }): Moves {
  const m: Moves = new Map();
  for (const u of us) {
    const d = delta(u);
    if (d.dx === 0 && d.dy === 0) continue;
    for (const id of u.ids) m.set(id, d);
  }
  return m;
}

export function alignObjects(objects: MapObject[], op: AlignOp): Moves {
  const us = units(objects);
  if (us.length < 2) return new Map();
  const all = unionBoxes(us.map((u) => u.box))!;
  return apply(us, ({ box: b }) => {
    switch (op) {
      case 'left': return { dx: all.x - b.x, dy: 0 };
      case 'right': return { dx: all.x + all.width - (b.x + b.width), dy: 0 };
      case 'hcenter': return { dx: all.x + all.width / 2 - (b.x + b.width / 2), dy: 0 };
      case 'top': return { dx: 0, dy: all.y - b.y };
      case 'bottom': return { dx: 0, dy: all.y + all.height - (b.y + b.height) };
      case 'vcenter': return { dx: 0, dy: all.y + all.height / 2 - (b.y + b.height / 2) };
    }
  });
}

/** Equal gaps between units, keeping the outermost two where they are. */
export function distributeObjects(objects: MapObject[], op: DistributeOp): Moves {
  const us = units(objects);
  if (us.length < 3) return new Map();
  const pos = op === 'horizontal' ? 'x' : 'y';
  const size = op === 'horizontal' ? 'width' : 'height';
  const sorted = [...us].sort((a, b) => a.box[pos] - b.box[pos]);
  const first = sorted[0].box;
  const last = sorted[sorted.length - 1].box;
  const total = sorted.reduce((n, u) => n + u.box[size], 0);
  const gap = (last[pos] + last[size] - first[pos] - total) / (sorted.length - 1);
  const targets = new Map<Unit, number>();
  let cursor = first[pos];
  for (const u of sorted) {
    targets.set(u, cursor);
    cursor += u.box[size] + gap;
  }
  return apply(us, (u) => {
    const d = targets.get(u)! - u.box[pos];
    return op === 'horizontal' ? { dx: d, dy: 0 } : { dx: 0, dy: d };
  });
}
