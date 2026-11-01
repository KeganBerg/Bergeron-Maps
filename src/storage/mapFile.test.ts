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
    expect(mapFileName({ name: 'Clematis / Garage: Level 1' })).toBe('Clematis-Garage-Level-1.bmap.json');
    expect(mapFileName({ name: '***' })).toBe('map.bmap.json');
  });
});
