import { describe, expect, it } from 'vitest';
import { createQuickLot, QUICK_LOT_DEFAULTS } from './quickLot';
import { createMap } from './factory';
import { mapThumbnail } from './thumbnail';

describe('mapThumbnail', () => {
  it('draws a built lot as boxes framed to fit', () => {
    const t = mapThumbnail(createQuickLot('Lot', QUICK_LOT_DEFAULTS))!;
    expect(t.shapes.length).toBeGreaterThan(10);
    const [x, y, w, h] = t.viewBox;
    for (const s of t.shapes) {
      if (s.rotation) continue;
      expect(s.x - s.width / 2).toBeGreaterThanOrEqual(x);
      expect(s.y - s.height / 2).toBeGreaterThanOrEqual(y);
      expect(s.x + s.width / 2).toBeLessThanOrEqual(x + w);
      expect(s.y + s.height / 2).toBeLessThanOrEqual(y + h);
    }
  });
  it('frames a turned shape by the box it fills', () => {
    const doc = createMap('One');
    doc.floors[0].objects = [{ id: 'a', kind: 'asset', assetKey: 'custom-rect', layerId: 'l', x: 0, y: 0, width: 100, height: 10, rotation: 90, fill: '#123456' }];
    const [, , w, h] = mapThumbnail(doc)!.viewBox;
    expect(h).toBeGreaterThan(w);
  });
  it('has no picture for an empty map', () => {
    expect(mapThumbnail(createMap('Empty'))).toBeNull();
  });
});
