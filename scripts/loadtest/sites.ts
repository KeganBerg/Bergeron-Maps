import { ASSET_BY_KEY } from '../../src/assets/library';
import { newId } from '../../src/model/ids';
import { createQuickLot } from '../../src/model/quickLot';
import type { MapDocument, MapObject } from '../../src/model/types';

/**
 * Synthetic very large sites for load testing. None of them is a real site.
 * - tower: the biggest garage the quick builder makes (12 levels x 2,080 = 24,960 spaces).
 * - sprawl: one huge surface lot (3 quick-lot blocks side by side, 6,240 spaces) with lights and signs.
 * - campus: 6 levels x 1,000 spaces, each level dressed with 250 extra symbols and labels.
 */
export type SiteName = 'tower' | 'sprawl' | 'campus';

function dress(doc: MapDocument, perFloor: number, seed = 1) {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const keys = ['light-pole', 'sign', 'trash', 'tree', 'ev-charger', 'camera'].filter((k) => ASSET_BY_KEY[k]);
  const pool = keys.length ? keys : Object.keys(ASSET_BY_KEY).filter((k) => !ASSET_BY_KEY[k].connector).slice(0, 6);
  for (const f of doc.floors) {
    const xs = f.objects.map((o) => o.x), ys = f.objects.map((o) => o.y);
    const [x1, x2, y1, y2] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    for (let i = 0; i < perFloor; i++) {
      const key = pool[i % pool.length], def = ASSET_BY_KEY[key];
      const layerId = (f.layers.find((l) => l.role === def.layer) ?? f.layers[0]).id;
      const o = { id: newId('as'), kind: 'asset', assetKey: key, layerId, x: x1 + rnd() * (x2 - x1), y: y1 + rnd() * (y2 - y1),
        width: def.width, height: def.height, rotation: 0, name: `${def.name ?? key} ${i + 1}` } as unknown as MapObject;
      f.objects.push(o);
    }
  }
  return doc;
}

export function buildSite(name: SiteName): MapDocument {
  if (name === 'tower') return createQuickLot('Load Test Tower', { floors: 12, rows: 26, spacesPerRow: 80, accessible: 8 });
  if (name === 'campus') return dress(createQuickLot('Load Test Campus', { floors: 6, rows: 20, spacesPerRow: 50, accessible: 6 }), 250);
  const block = createQuickLot('Load Test Sprawl', { floors: 1, rows: 26, spacesPerRow: 80, accessible: 8 });
  const f = block.floors[0];
  const xs = f.objects.map((o) => o.x + o.width / 2);
  const w = Math.max(...xs) - Math.min(...f.objects.map((o) => o.x - o.width / 2)) + 400;
  const base = [...f.objects];
  for (let k = 1; k < 3; k++) {
    for (const o of base) {
      if (o.kind === 'asset' && ASSET_BY_KEY[o.assetKey]?.connector) continue;
      const c = structuredClone(o);
      c.id = newId(o.kind === 'space' ? 'sp' : 'as');
      c.x += k * w;
      if (c.kind === 'space' && c.label) c.label = `${String.fromCharCode(65 + k)}${c.label}`;
      f.objects.push(c);
    }
  }
  return dress(block, 300);
}

export const count = (doc: MapDocument) => ({
  floors: doc.floors.length,
  spaces: doc.floors.reduce((n, f) => n + f.objects.filter((o) => o.kind === 'space').length, 0),
  objects: doc.floors.reduce((n, f) => n + f.objects.length, 0),
});
