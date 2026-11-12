import { describe, expect, it } from 'vitest';
import { createQuickLot } from '../model/quickLot';
import { mapFileName, parseMapFile, serializeMapFile } from './mapFile';

describe('map files', () => {
  const doc = createQuickLot('Harbor Garage', { floors: 2, rows: 2, spacesPerRow: 5, accessible: 1 });

  it('round-trips a map and gives the import a new id', () => {
    const back = parseMapFile(serializeMapFile(doc));
    expect(back.id).not.toBe(doc.id);
    expect(back.revision).toBe(0);
    expect(back.name).toBe('Harbor Garage');
    expect(back.floors.map((f) => f.objects.length)).toEqual(doc.floors.map((f) => f.objects.length));
  });

  it('also accepts a bare map document', () => {
    expect(parseMapFile(JSON.stringify(doc)).floors).toHaveLength(2);
  });

  it('rejects files that are not maps, with a readable message', () => {
    expect(() => parseMapFile('not json')).toThrow('not a Bergeron Maps map file');
    expect(() => parseMapFile('{"hello":1}')).toThrow('not a valid map');
    const broken = structuredClone(doc);
    (broken.floors[0].objects[0] as { x: unknown }).x = 'left';
    expect(() => parseMapFile(JSON.stringify(broken))).toThrow('can’t read');
    const unknownAsset = structuredClone(doc);
    const a = unknownAsset.floors[0].objects.find((o) => o.kind === 'asset')!;
    (a as { assetKey: string }).assetKey = 'spaceship';
    expect(() => parseMapFile(JSON.stringify(unknownAsset))).toThrow('can’t read');
  });

  it('builds a safe file name', () => {
    expect(mapFileName({ name: 'Site Name / Garage: Level 1' })).toBe('Site-Name-Garage-Level-1.bmap.json');
    expect(mapFileName({ name: '***' })).toBe('map.bmap.json');
  });

  it('turns damaged structure into a readable message, not a code error', () => {
    const bad = (fn: (d: Record<string, any>) => void) => {
      const d = structuredClone(doc) as unknown as Record<string, any>;
      fn(d);
      return () => parseMapFile(JSON.stringify(d));
    };
    expect(bad((d) => (d.floors = [null]))).toThrow('not a valid map');
    expect(bad((d) => (d.floors[0].objects = 5))).toThrow('not a valid map');
    expect(bad((d) => (d.floors[0].layers = [null]))).toThrow('not a valid map');
    expect(bad((d) => (d.floors[0].objects = [null]))).toThrow('can’t read');
  });

  it('repairs bad optional values so the map still opens', () => {
    const d = structuredClone(doc) as unknown as Record<string, any>;
    d.name = '   ';
    d.settings = { gridSize: 'big' };
    const f = d.floors[0];
    f.rows = 'nope';
    f.name = '';
    const [a, b] = f.objects;
    a.cuts = 'x';
    a.width = 1e300;
    a.x = -1e300;
    a.fill = 'url(evil)';
    a.fillOpacity = 7;
    b.id = a.id;
    f.background = { layerId: 'gone', src: 'data:image/png;base64,AA', x: 0, y: 0, width: -10, height: 'tall' };
    d.floors[1].id = f.id;
    const out = parseMapFile(JSON.stringify(d));
    expect(out.name).toBe('Imported map');
    expect(out.settings.gridSize).toBe(10);
    const [fa, fb] = out.floors;
    expect(fa.id).not.toBe(fb.id);
    expect(fa.name).toBe('Floor 1');
    expect(fa.rows).toEqual({});
    expect(fa.background).toBeUndefined();
    const [oa, ob] = fa.objects;
    expect(oa.id).not.toBe(ob.id);
    expect(oa.cuts).toBeUndefined();
    expect(oa.width).toBe(100_000);
    expect(oa.x).toBe(-1_000_000);
    expect(oa.fillOpacity).toBe(1);
    expect(oa.kind === 'space' ? oa.fill : '#ffffff').toBe('#ffffff');
  });
});
