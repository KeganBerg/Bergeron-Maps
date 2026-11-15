import { describe, expect, it } from 'vitest';
import { ASSET_BY_KEY, renderAssetSvg } from '../assets/library';
import { cleanLabelLayout, patchLabelLayout } from './labelLayout';
import { labelSpot } from '../render/labelSpot';
import type { AssetObject } from './types';

const zone = ASSET_BY_KEY['custom-zone'];
const obj = (extra: Partial<AssetObject> = {}): AssetObject => ({
  id: 'z', kind: 'asset', assetKey: 'custom-zone', layerId: 'l', x: 0, y: 0, width: 220, height: 130, rotation: 0, label: 'Service', ...extra,
}) as AssetObject;
const circle = (svg: string) => {
  const m = /<circle cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)"/.exec(svg)!;
  return { cx: Number(m[1]), cy: Number(m[2]), r: Number(m[3]) };
};

describe('label layout', () => {
  it('cleans untrusted values and drops defaults', () => {
    expect(cleanLabelLayout({ text: { x: 5, y: -1 }, textScale: 99 })).toEqual({ text: { x: 1, y: 0 }, textScale: 3 });
    expect(cleanLabelLayout({ text: { x: '1"/>', y: 0 }, symbolScale: 1 })).toBeUndefined();
    expect(cleanLabelLayout('nope')).toBeUndefined();
    expect(patchLabelLayout({ textScale: 2 }, { textScale: 1 })).toBeUndefined();
    expect(patchLabelLayout({ textScale: 2 }, { symbol: { x: 0.1, y: 0.2 } })).toEqual({ textScale: 2, symbol: { x: 0.1, y: 0.2 } });
  });

  it('moves and resizes the zone symbol', () => {
    const plain = circle(renderAssetSvg(zone, obj()));
    const moved = circle(renderAssetSvg(zone, obj({ labelLayout: { symbol: { x: 0.1, y: 0.2 }, symbolScale: 2 } })));
    expect(moved.cx).toBeCloseTo(22, 0);
    expect(moved.cy).toBeCloseTo(26, 0);
    expect(moved.r).toBeCloseTo(plain.r * 2, 0);
  });

  it('centres the symbol when the name is hidden', () => {
    const c = circle(renderAssetSvg(zone, obj({ labelHidden: true })));
    expect(c.cx).toBeCloseTo(110, 0);
    expect(c.cy).toBeCloseTo(65, 0);
  });

  it('places and sizes the name', () => {
    const base = labelSpot(zone, obj())!;
    expect(base.x).toBe(110);
    expect(base.moved).toBe(false);
    const moved = labelSpot(zone, obj({ labelLayout: { text: { x: 0.25, y: 0.75 }, textScale: 1.5 } }))!;
    expect(moved).toMatchObject({ x: 55, y: 97.5, moved: true });
    expect(moved.size).toBeCloseTo(base.size * 1.5);
  });
});
