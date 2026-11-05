import { describe, expect, it } from 'vitest';
import { ASSET_BY_KEY, renderAssetSvg, symbolSupport } from './library';
import { isSafePath, symbolSvg } from './symbols';

const P = 'M240-120v-720h288q98 0 165 67t67 165Z';

describe('symbols', () => {
  it('only accepts plain path data', () => {
    expect(isSafePath(P)).toBe(true);
    expect(isSafePath('M0 0"/><script>alert(1)</script>')).toBe(false);
    expect(symbolSvg('M0 0" onload="x', 0, 0, 10, '#000')).toBe('');
  });

  it('draws a chosen symbol on a custom zone, or none when switched off', () => {
    const zone = ASSET_BY_KEY['custom-zone'];
    const base = { width: 220, height: 130 };
    expect(symbolSupport(zone)).toEqual({ custom: true, builtIn: true });
    expect(renderAssetSvg(zone, { ...base, symbol: { name: 'local_parking', path: P } })).toContain(P);
    const off = renderAssetSvg(zone, { ...base, symbolHidden: true });
    expect(off).not.toContain('<circle');
    expect(renderAssetSvg(zone, base)).toContain('<circle');
  });

  it('puts the symbol on the custom symbol disc instead of its text', () => {
    const disc = ASSET_BY_KEY['custom-symbol'];
    expect(symbolSupport(disc).custom).toBe(true);
    const svg = renderAssetSvg(disc, { width: 34, height: 34, label: '★', symbol: { name: 'key', path: P } });
    expect(svg).toContain(P);
    expect(svg).not.toContain('★');
  });

  it('ignores unsafe symbol data from a map file', () => {
    const zone = ASSET_BY_KEY['custom-zone'];
    const svg = renderAssetSvg(zone, { width: 220, height: 130, symbol: { name: 'x', path: '"/><image href="http://x"/>' } });
    expect(svg).not.toContain('http://x');
  });
});
