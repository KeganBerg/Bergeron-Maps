import { expect, test } from '@playwright/test';
import { addFromLibrary, newMap } from './helpers';
import { editorState, realClick, realDrag, toScreen, type ObjInfo } from './real-input';

/** Bugs found in the real-user audit (2026-11-12), each driven with real input. */

for (const width of [1280, 1366, 1440, 1920]) {
  test(`the map does not jump while editing and publishing at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await newMap(page, 'Steady');
    const top = async () => (await page.getByTestId('canvas').boundingBox())!.y;
    const seen = new Set<number>([await top()]);
    // Sample the canvas position through a save cycle, a publish and another edit.
    const watch = async (ms: number) => {
      const end = Date.now() + ms;
      while (Date.now() < end) seen.add(Math.round(await top()));
    };
    await addFromLibrary(page, 'column');
    await watch(1500);
    await page.getByTestId('publish').click();
    await expect(page.getByTestId('publish')).toHaveAttribute('data-state', 'current');
    await watch(300);
    await page.getByTestId('asset-search').blur();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('publish')).toHaveAttribute('data-state', 'changes');
    await watch(1500);
    expect([...seen].map(Math.round).filter((v, i, a) => a.indexOf(v) === i)).toHaveLength(1);
  });
}

test('undoing a delete brings the object back selected, ready to drag', async ({ page }) => {
  await newMap(page, 'Undo');
  await addFromLibrary(page, 'stairs');
  await page.getByTestId('asset-search').blur();
  const o = (await editorState(page)).objects[0] as ObjInfo;
  await page.keyboard.press('Delete');
  await page.keyboard.press('Control+z');
  expect((await editorState(page)).selection).toEqual([o.id]);
  await expect(page.getByTestId('selected-name')).toHaveText('Stairway 1');
  const from = await toScreen(page, o, { x: 0, y: 0 });
  await realDrag(page, from, { x: from.x + 80, y: from.y });
  expect((await editorState(page)).objects[0].x).toBeGreaterThan(o.x);
});

test('a long text label grows to fit instead of being cut off', async ({ page }) => {
  await newMap(page, 'Labels');
  await page.getByTestId('tool-text').click();
  const c = (await page.getByTestId('canvas').boundingBox())!;
  await realClick(page, { x: c.x + c.width / 2, y: c.y + c.height / 2 });
  const field = page.getByTestId('text-value');
  await field.fill('Administration office');
  await field.press('Enter');
  await expect.poll(async () => (await editorState(page)).objects[0].name).toBe('Administration office');
  // Every drawn line fits inside the label box, and no words were dropped.
  const drawn = await page.evaluate(() => {
    type T = { textArr: { text: string; width: number }[]; width: () => number };
    const st = (window as unknown as { Konva: { stages: { find: (s: string) => { findOne: (s: string) => T }[] }[] } }).Konva.stages[0];
    const t = st.find('.obj')[0].findOne('Text');
    return { lines: t.textArr.map((l) => l.text).join(' '), widest: Math.max(...t.textArr.map((l) => l.width)), box: t.width() };
  });
  expect(drawn.lines.replace(/\s+/g, ' ').trim()).toBe('Administration office');
  expect(drawn.widest).toBeLessThanOrEqual(drawn.box + 0.5);
});

test('a room name stays inside the room', async ({ page }) => {
  await newMap(page, 'Rooms');
  for (const key of ['customer-waiting-room', 'restroom-accessible', 'admin-office']) {
    await addFromLibrary(page, key);
  }
  const overflow = await page.evaluate(() => {
    type N = { getClientRect: (o?: object) => { x: number; y: number; width: number; height: number }; find: (s: string) => N[]; text?: () => string; isVisible: () => boolean };
    const st = (window as unknown as { Konva: { stages: { find: (s: string) => N[] }[] } }).Konva.stages[0];
    const out: string[] = [];
    for (const g of st.find('.obj')) {
      const box = g.find('Image')[0]?.getClientRect() ?? g.getClientRect();
      for (const t of g.find('Text')) {
        const r = t.getClientRect();
        if (r.y > box.y + box.height) continue; // the caption under the object
        if (r.x < box.x - 1 || r.x + r.width > box.x + box.width + 1) out.push(t.text!());
      }
    }
    return out;
  });
  expect(overflow).toEqual([]);
});

test('an employee typing just the number finds spaces numbered per floor ("F6 37")', async ({ page }) => {
  await page.goto('/');
  const id = await page.evaluate(async () => {
    const { createMap, createFloor } = await import('/src/model/factory.ts');
    const { buildRowSpaces, DEFAULT_ROW } = await import('/src/model/rows.ts');
    const { repository } = await import('/src/storage/indexedDbRepository.ts');
    const doc = createMap('Deck Garage');
    doc.floors[0].name = 'F1';
    const f6 = createFloor('F6');
    doc.floors.push(f6);
    for (const [f, p] of [[doc.floors[0], 'F1 '], [f6, 'F6 ']] as const) {
      const spec = { ...DEFAULT_ROW, id: `row_${p.trim()}`, prefix: p, count: 40 };
      f.rows[spec.id] = spec;
      f.objects.push(...buildRowSpaces(spec, { x: 0, y: 0, rotation: 0 }, f.layers[2].id));
    }
    await repository.createMap(doc);
    await repository.publishMap(doc.id);
    return doc.id;
  });
  await page.goto(`/#/view/${id}`);
  await page.getByTestId('viewer-floor-F6').click();
  const search = page.getByTestId('viewer-search');
  await search.click();
  await page.keyboard.type('37');
  await expect(page.getByTestId('search-results')).toContainText('Space F1 37');
  await expect(page.getByTestId('search-results')).toContainText('Space F6 37');
  // Enter goes to the one on the floor being looked at.
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('info-card')).toContainText('Space F6 37');
});

test('inside a building, the resize handles resize instead of picking the outer walls', async ({ page }) => {
  await newMap(page, 'Walls');
  await page.getByTestId('snap-mode').selectOption('free');
  await addFromLibrary(page, 'office-building');
  await page.getByTestId('enter-building').click();
  await addFromLibrary(page, 'conference-table');
  await page.getByTestId('asset-search').blur();
  const t0 = (await editorState(page)).objects.find((o) => o.name === 'Conference table 1')!;
  for (const name of ['bottom-right', 'middle-right']) {
    const h = await page.evaluate((n) => {
      type A = { getClientRect: () => { x: number; y: number; width: number; height: number } };
      const st = (window as unknown as { Konva: { stages: { findOne: (s: string) => A; container: () => HTMLElement }[] } }).Konva.stages[0];
      const r = st.findOne(`.${n}`).getClientRect();
      const b = st.container().getBoundingClientRect();
      return { x: b.left + r.x + r.width / 2, y: b.top + r.y + r.height / 2 };
    }, name);
    // Press a little off the handle's middle, as a person does.
    await realDrag(page, { x: h.x + 2, y: h.y + 2 }, { x: h.x + 32, y: h.y + 22 });
    await expect(page.getByTestId('selected-name')).toHaveText('Conference table 1');
  }
  const t1 = (await editorState(page)).objects.find((o) => o.name === 'Conference table 1')!;
  expect(t1.width).toBeGreaterThan(t0.width + 20);
});
