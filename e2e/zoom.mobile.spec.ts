import { expect, test, type CDPSession, type Page } from '@playwright/test';

async function seedRowMap(page: Page) {
  await page.goto('/');
  return page.evaluate(async () => {
    const { createMap } = await import('/src/model/factory.ts');
    const { buildRowSpaces, DEFAULT_ROW } = await import('/src/model/rows.ts');
    const { repository } = await import('/src/storage/indexedDbRepository.ts');
    const doc = createMap('Pinch Garage');
    const f = doc.floors[0];
    const spec = { ...DEFAULT_ROW, id: 'row_a', prefix: 'A', count: 20 };
    f.rows[spec.id] = spec;
    f.objects.push(...buildRowSpaces(spec, { x: 0, y: 0, rotation: 0 }, f.layers[2].id));
    await repository.createMap(doc);
    await repository.publishMap(doc.id);
    return doc.id;
  });
}

const touch = (cdp: CDPSession, type: 'touchStart' | 'touchMove' | 'touchEnd', pts: [number, number][]) =>
  cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id })) });

/** Two fingers spread from `from` to `to` px either side of (cx, cy). */
async function pinch(cdp: CDPSession, cx: number, cy: number, from: number, to: number) {
  await touch(cdp, 'touchStart', [[cx - from, cy]]);
  await touch(cdp, 'touchStart', [[cx - from, cy], [cx + from, cy]]);
  for (let i = 1; i <= 8; i++) {
    const d = from + ((to - from) * i) / 8;
    await touch(cdp, 'touchMove', [[cx - d, cy], [cx + d, cy]]);
  }
  await touch(cdp, 'touchEnd', []);
}

const editorState = (page: Page) =>
  page.evaluate(async () => {
    const s = (await import('/src/editor/store.ts')).useEditor.getState();
    return { v: s.viewport, first: [s.doc!.floors[0].objects[0].x, s.doc!.floors[0].objects[0].y], selected: s.selection.length };
  });

test('phone editor: pinch zooms around the fingers and never drags the map objects', async ({ page, context }) => {
  const id = await seedRowMap(page);
  await page.goto(`/#/edit/${id}`);
  await expect(page.getByTestId('canvas').locator('canvas').first()).toBeVisible();
  const cdp = await context.newCDPSession(page);
  const c = (await page.getByTestId('canvas').boundingBox())!;
  const before = await editorState(page);
  const cx = c.x + c.width / 2;
  const cy = c.y + c.height / 2;
  // Start the pinch on top of the row of spaces.
  await pinch(cdp, cx, before.v.y + c.y, 40, 120);
  await expect.poll(async () => (await editorState(page)).v.scale).toBeCloseTo(before.v.scale * 3, 1);
  const after = await editorState(page);
  expect(after.first).toEqual(before.first);

  // One finger drag on the map pans it.
  await touch(cdp, 'touchStart', [[cx, cy]]);
  for (let i = 1; i <= 5; i++) await touch(cdp, 'touchMove', [[cx + i * 12, cy + i * 8]]);
  await touch(cdp, 'touchEnd', []);
  await expect.poll(async () => (await editorState(page)).v.x).toBeCloseTo(after.v.x + 60, 0);
  expect((await editorState(page)).first).toEqual(before.first);
});

test('phone viewer: pinch zoom follows the fingers, then a drag pans', async ({ page, context }) => {
  const id = await seedRowMap(page);
  await page.goto(`/#/view/${id}`);
  await expect(page.getByTestId('viewer-facility')).toHaveText('Pinch Garage');
  const cdp = await context.newCDPSession(page);
  const box = (await page.locator('.viewer-canvas').boundingBox())!;
  const stage = () => page.evaluate(() => {
    const s = (window as unknown as { Konva: { stages: { x(): number; scaleX(): number }[] } }).Konva.stages[0];
    return { x: s.x(), scale: s.scaleX() };
  });
  const s0 = await stage();
  await pinch(cdp, box.x + box.width / 2, box.y + box.height / 2, 40, 80);
  await expect.poll(async () => (await stage()).scale).toBeCloseTo(s0.scale * 2, 2);
  const s1 = await stage();
  await touch(cdp, 'touchStart', [[box.x + 50, box.y + 100]]);
  for (let i = 1; i <= 5; i++) await touch(cdp, 'touchMove', [[box.x + 50 + i * 10, box.y + 100]]);
  await touch(cdp, 'touchEnd', []);
  await expect.poll(async () => (await stage()).x).toBeCloseTo(s1.x + 50, 0);
  // Panning isn't a tap: nothing got picked.
  await expect(page.getByTestId('info-card')).toHaveCount(0);
});
