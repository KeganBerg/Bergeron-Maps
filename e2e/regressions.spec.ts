import { expect, test, type Locator } from '@playwright/test';
import { addFromLibrary, newMap } from './helpers';

/** Text color and background of a field must differ enough to read what is typed. */
async function contrast(el: Locator) {
  return el.evaluate((node) => {
    const rgb = (c: string) => (c.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
    const lum = (c: number[]) => {
      const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
      return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
    };
    const cs = getComputedStyle(node);
    const a = lum(rgb(cs.color));
    const b = lum(rgb(cs.backgroundColor));
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  });
}

for (const theme of ['signage', 'classic', 'night']) {
  test(`typing a floor name is readable (${theme})`, async ({ page }) => {
    await page.goto(`/?theme=${theme}`);
    await newMap(page, 'Readable');
    await page.getByTestId('floor-tab-Floor 1').dblclick();
    const input = page.getByTestId('floor-rename');
    await input.fill('Rooftop');
    expect(await contrast(input)).toBeGreaterThan(4.5);
  });
}

test('a selection box released outside the map still selects and goes away', async ({ page }) => {
  await newMap(page, 'Marquee');
  await addFromLibrary(page, 'column');
  await page.keyboard.press('Escape');
  const c = (await page.getByTestId('canvas').boundingBox())!;
  await page.mouse.move(c.x + 20, c.y + 20);
  await page.mouse.down();
  await page.mouse.move(c.x + c.width - 20, c.y + c.height - 20, { steps: 6 });
  // Let go over the floor tabs, below the map.
  await page.mouse.move(c.x + c.width / 2, c.y + c.height + 20, { steps: 3 });
  await page.mouse.up();
  await expect(page.getByTestId('selected-name')).toHaveText('Column 1');
});

test('duplicating a named object gives the copy the next number', async ({ page }) => {
  await newMap(page, 'Names');
  await addFromLibrary(page, 'column');
  await page.getByTestId('asset-search').blur();
  await page.keyboard.press('Control+d');
  await expect(page.getByTestId('selected-name')).toHaveText('Column 2');
  await page.keyboard.press('Control+c');
  await page.keyboard.press('Control+v');
  await expect(page.getByTestId('selected-name')).toHaveText('Column 3');
});

test('a selected object drags even where another object is drawn over it; a click still picks the top one', async ({ page }) => {
  await newMap(page, 'Covered');
  await addFromLibrary(page, 'grass-divider');
  // A sidewalk dropped in the same place lies on top of the divider and covers it.
  await addFromLibrary(page, 'sidewalk');
  const state = () => page.evaluate(async () => {
    const { useEditor } = await import('/src/editor/store.ts');
    const st = useEditor.getState();
    const objs = st.doc!.floors.flatMap((f) => f.objects);
    const get = (k: string) => objs.find((o) => o.kind === 'asset' && o.assetKey === k)!;
    return { divider: { id: get('grass-divider').id, x: get('grass-divider').x, y: get('grass-divider').y }, sidewalk: { x: get('sidewalk').x, y: get('sidewalk').y }, selection: st.selection };
  });
  // New objects cascade so they don't hide each other; put the sidewalk right over the divider.
  await page.evaluate(async () => {
    const { useEditor } = await import('/src/editor/store.ts');
    const st = useEditor.getState();
    const objs = st.doc!.floors.flatMap((f) => f.objects);
    const d = objs.find((o) => o.kind === 'asset' && o.assetKey === 'grass-divider')!;
    const w = objs.find((o) => o.kind === 'asset' && o.assetKey === 'sidewalk')!;
    st.updateObjects([w.id], { x: d.x, y: d.y });
  });
  const s0 = await state();
  // Pick the divider from the Layers list, as a user would when it is covered.
  await page.evaluate(async (id) => (await import('/src/editor/store.ts')).useEditor.getState().clickObject(id, { additive: false }), s0.divider.id);
  const at = await page.evaluate((id) => {
    const stage = (window as unknown as { Konva: { stages: { findOne: (s: string) => { getClientRect: () => { x: number; y: number; width: number; height: number } }; container: () => HTMLElement }[] } }).Konva.stages[0];
    const r = stage.findOne('#' + id).getClientRect();
    const c = stage.container().getBoundingClientRect();
    return { x: c.x + r.x + r.width / 2, y: c.y + r.y + r.height / 2 };
  }, s0.divider.id);
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  await page.mouse.move(at.x + 60, at.y + 40, { steps: 8 });
  await page.mouse.up();
  const s1 = await state();
  expect(s1.divider.x).toBeGreaterThan(s0.divider.x + 20);
  expect(s1.sidewalk).toEqual(s0.sidewalk);
  expect(s1.selection).toEqual([s0.divider.id]);
  // A plain click where the sidewalk is on top selects the sidewalk.
  await page.mouse.click(at.x - 100, at.y);
  const s2 = await state();
  expect(s2.selection).not.toEqual([s0.divider.id]);
});

test('the Add panel: full search hint, one Parking spaces list, a few groups', async ({ page }) => {
  await newMap(page, 'Add panel');
  const search = page.getByTestId('asset-search');
  // The placeholder fits the box (it used to be cut off mid-word).
  const fits = await search.evaluate((el: HTMLInputElement) => {
    const c = document.createElement('canvas').getContext('2d')!;
    c.font = getComputedStyle(el).font;
    return c.measureText(el.placeholder).width <= el.clientWidth;
  });
  expect(fits).toBe(true);
  const sidebar = page.locator('aside.sidebar');
  await expect(sidebar.getByText('Parking spaces', { exact: true })).toHaveCount(1);
  expect(await sidebar.locator('.lib-group').count()).toBeLessThanOrEqual(6);
  // Sentence case: no uppercase transform on the panel's headings or rows.
  const upper = await sidebar.locator('h4, summary').evaluateAll((els) => els.filter((e) => getComputedStyle(e).textTransform === 'uppercase').length);
  expect(upper).toBe(0);
});
