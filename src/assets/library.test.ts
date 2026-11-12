import { describe, expect, it } from 'vitest';
import { fitLabel, splitLabel } from '../render/fitLabel';
import { ASSET_BY_KEY, ASSET_CATEGORIES, ASSETS, assetsIn, renderAssetSvg, searchAssets } from './library';
import { icon } from './style';

/** Every key an earlier version of the app could have saved in a map. */
const LEGACY_KEYS = ['wall', 'column', 'road', 'curb', 'ramp', 'stairs', 'elevator', 'walkway', 'entrance', 'exit', 'gate', 'barrier-arm',
  'valet-booth', 'key-box', 'pay-station', 'ev-charger', 'office', 'arrow', 'accessible', 'fire-lane', 'stop-sign', 'no-parking', 'sign',
  'hydrant', 'car', 'truck', 'tree', 'shrub', 'planter', 'building', 'light-pole', 'trash'];

describe('asset library', () => {
  it('has unique keys', () => {
    const keys = ASSETS.map((a) => a.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('fills every category from the spec', () => {
    for (const c of ASSET_CATEGORIES) expect(assetsIn(c).length, c).toBeGreaterThan(5);
    expect(ASSETS.length).toBeGreaterThan(330);
  });

  it('keeps every key older maps may contain', () => {
    for (const k of LEGACY_KEYS) expect(ASSET_BY_KEY[k], k).toBeDefined();
  });

  it('draws every asset as valid SVG at default size, stretched, with and without borders', () => {
    const parser = new DOMParser();
    for (const a of ASSETS.filter((x) => (x.creates ?? 'asset') === 'asset')) {
      for (const o of [
        { width: a.width, height: a.height },
        { width: a.width * 2.5, height: a.height * 0.6, strokeWidth: 0, fillOpacity: 0.3, label: 'Test 12' },
      ]) {
        const svg = renderAssetSvg(a, o);
        expect(svg, a.key).not.toMatch(/NaN|undefined|Infinity/);
        const doc = parser.parseFromString(svg, 'image/svg+xml');
        expect(doc.querySelector('parsererror'), `${a.key}: ${svg.slice(0, 200)}`).toBeNull();
      }
    }
  });

  it('applies the fill opacity and border the user picked', () => {
    const svg = renderAssetSvg(ASSET_BY_KEY['valet-booth'], { width: 60, height: 50, fill: '#123456', fillOpacity: 0.4, stroke: '#abcdef', strokeWidth: 2 });
    expect(svg).toContain('fill="#123456" fill-opacity="0.4"');
    expect(svg).toContain('stroke="#abcdef"');
    expect(renderAssetSvg(ASSET_BY_KEY.wall, { width: 100, height: 10, strokeWidth: 0 })).toContain('stroke="none"');
  });

  it('centres the turnaround lane line between the island and the outer edge', () => {
    for (const [width, height, strokeWidth] of [[240, 240, 0], [400, 400, 0], [400, 240, 6], [120, 300, 3]]) {
      const svg = renderAssetSvg(ASSET_BY_KEY.turnaround, { width, height, strokeWidth });
      const circles = [...svg.matchAll(/<circle cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)"/g)].map((m) => m.slice(1).map(Number));
      expect(circles, `${width}x${height}`).toHaveLength(3);
      const [outer, island, lane] = circles;
      for (const c of [island, lane]) expect([c[0], c[1]]).toEqual([outer[0], outer[1]]);
      const r = Math.min(width, height) / 2;
      const gapIn = lane[2] - (island[2] + 1), gapOut = (r - strokeWidth) - lane[2];
      expect(Math.abs(gapIn - gapOut), `${width}x${height}`).toBeLessThan(0.1);
    }
  });

  it('finds assets by everyday words', () => {
    expect(searchAssets('ada').some((a) => a.key === 'space-accessible')).toBe(true);
    expect(searchAssets('cul de sac').map((a) => a.key)).toContain('turnaround');
  });
});

describe('icons keep their proportions', () => {
  it('scales uniformly and centers inside a stretched box', () => {
    const draw = icon(20, 10, () => '<rect/>');
    const out = draw({ w: 100, h: 100, fill: '#000', fo: 1, stroke: '#000', sw: 1, label: '' });
    expect(out).toContain('scale(5)');
    expect(out).toContain('translate(0 25)');
  });
});

describe('space number fitting', () => {
  it('splits prefix from number', () => {
    expect(splitLabel('F6 116')).toEqual(['F6', '116']);
    expect(splitLabel('B16')).toEqual(['B', '16']);
    expect(splitLabel('12')).toBeNull();
  });

  it('breaks a long number onto two lines in a narrow stall instead of overflowing', () => {
    const f = fitLabel('F6 116', 15, 44, 45);
    expect(f.lines).toEqual(['F6', '116']);
    expect(f.size * 0.62 * 3).toBeLessThanOrEqual(44);
  });

  it('keeps short numbers on one line at full size', () => {
    expect(fitLabel('12', 15, 45, 90)).toEqual({ lines: ['12'], size: 15 });
  });
});

describe('schools and campuses', () => {
  it('lists every school item once, reusing general assets instead of copying them', () => {
    const school = assetsIn('Schools and campuses');
    const names = school.map((a) => a.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
    for (const k of ['stop-sign', 'crosswalk', 'hydrant', 'speed-bump', 'loading-dock', 'turnaround', 'bike-rack', 'school-bus', 'football-field']) {
      expect(school.map((a) => a.key), k).toContain(k);
    }
    // No two assets anywhere in the library share a name.
    const all = ASSETS.map((a) => a.name.toLowerCase());
    expect(new Set(all).size).toBe(all.length);
    expect(searchAssets('parent pickup').map((a) => a.key)).toContain('valet-pickup');
    expect(searchAssets('manhole').map((a) => a.key)).toContain('sewer-access');
  });
});

describe('garage openings', () => {
  it('turn their ENTER/EXIT tag to stay readable when placed upside down', () => {
    const def = ASSET_BY_KEY.entrance;
    expect(renderAssetSvg(def, { width: 120, height: 44 })).not.toContain('rotate(180');
    expect(renderAssetSvg(def, { width: 120, height: 44, rotation: 180 })).toContain('rotate(180 76 26)');
    expect(renderAssetSvg(def, { width: 120, height: 44, rotation: -90 })).not.toContain('rotate(180');
  });
});
