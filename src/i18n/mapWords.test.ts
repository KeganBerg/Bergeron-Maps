import { describe, expect, it } from 'vitest';
import { createQuickLot } from '../model/quickLot';
import { findRoute, startPlaces } from '../model/route';
import { floorListing } from '../model/listing';
import { searchMap } from '../model/search';
import { es } from './es';
import { zh } from './zh';

/** The map logic speaks the reader's language when the viewer passes its words. Names typed on the map stay as typed. */
const place = (doc: ReturnType<typeof createQuickLot>, floor: number, find: (o: { name?: string; label?: string; kind: string }) => boolean) => {
  const f = doc.floors[floor];
  const o = f.objects.find(find)!;
  return { floorId: f.id, objectId: o.id, x: o.x, y: o.y };
};

describe('map words in another language', () => {
  it('writes the route steps and their map tags in Spanish, keeping the names from the map', () => {
    const doc = createQuickLot('Garage', { floors: 3, rows: 2, spacesPerRow: 10, accessible: 0 });
    const from = place(doc, 0, (o) => o.name === 'Entrance');
    const to = place(doc, 2, (o) => o.kind === 'space' && o.label === '3B5');
    const r = findRoute(doc, from, to, { words: es.words });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const texts = r.route.steps.map((s) => s.text);
    expect(texts[0]).toMatch(/^Camine hasta (Elevator|Stairway) 1$/);
    expect(texts[1]).toMatch(/^Tome (Elevator|Stairway) 1 para subir a Floor 3$/);
    expect(texts[2]).toBe('Camine hasta Espacio 3B5');
    expect(r.route.steps[1].tag).toBe('Suba a Floor 3');
  });

  it('keeps English as the default, with the same tag the map always showed', () => {
    const doc = createQuickLot('Garage', { floors: 2, rows: 2, spacesPerRow: 6, accessible: 0 });
    const r = findRoute(doc, place(doc, 0, (o) => o.name === 'Entrance'), place(doc, 1, (o) => o.kind === 'space' && o.label === '2B3'));
    expect(r.ok && r.route.steps.find((s) => s.kind !== 'walk')?.tag).toBe('Up to Floor 2');
  });

  it('names unnamed symbols in the reader’s language, and finds them by that name too', () => {
    const doc = createQuickLot('Lot', { floors: 2, rows: 2, spacesPerRow: 4, accessible: 0 });
    const elevator = doc.floors[0].objects.find((o) => o.kind === 'asset' && o.assetKey === 'elevator')!;
    expect(elevator).toBeDefined();
    if (elevator.kind === 'asset') { elevator.name = ''; elevator.label = ''; }
    expect(startPlaces(doc, zh.words).find((p) => p.obj.id === elevator.id)?.name).toBe('电梯');
    expect(searchMap(doc, 'elevador', es.words).some((h) => h.object.id === elevator.id)).toBe(true);
    expect(searchMap(doc, '1A1', es.words)[0]?.title).toBe('Espacio 1A1');
  });

  it('heads the floor list in Spanish', () => {
    const doc = createQuickLot('Lot', { floors: 1, rows: 2, spacesPerRow: 4, accessible: 1 });
    const groups = floorListing(doc, doc.floors[0], es.words);
    expect(groups[0].title).toBe('Lugares');
    expect(groups[1].title).toMatch(/^Fila: espacios \S+ a \S+$/);
    expect(groups.flatMap((g) => g.items).some((i) => i.detail === 'Accesible')).toBe(true);
  });

  it('spaces Chinese the standard way: a space next to Latin letters and digits, none between Chinese characters', () => {
    expect(zh.words.walkTo('Elevator 1')).toBe('步行至 Elevator 1');
    expect(zh.words.walkTo('电梯')).toBe('步行至电梯');
    expect(zh.words.space('3B5')).toBe('车位 3B5');
    expect(zh.routeSummary(180, 2, 'Entrance')).toBe('180 英尺，从 Entrance 出发约需 2 分钟');
  });
});

describe('joining pieces of text', () => {
  it('leaves out empty pieces and uses each language’s comma', async () => {
    const { zh } = await import('./zh');
    const { ENGLISH } = await import('../model/words');
    expect(ENGLISH.parts(['Floor 3', undefined, false, 'Accessible'])).toBe('Floor 3, Accessible');
    expect(zh.words.parts(['车位 3B5', 'Floor 3'])).toBe('车位 3B5，Floor 3');
    expect(zh.words.list(['Floor 2', 'Floor 3'])).toBe('Floor 2、Floor 3');
  });
});

describe('building names', () => {
  it('calls an unnamed building by its kind, in the reader’s language', async () => {
    const { buildingTitle } = await import('../model/interiors');
    const b = { kind: 'asset', assetKey: 'service-department', name: '', label: '' } as unknown as Parameters<typeof buildingTitle>[0];
    expect(buildingTitle(b)).toBe('Service department');
    expect(buildingTitle(b, es.words)).toBe('Departamento de servicio');
    expect(buildingTitle({ ...b, name: 'Shop B' })).toBe('Shop B');
  });
});
