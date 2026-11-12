import { expect, test, type Page } from '@playwright/test';
import { editorSelection, seedLot, settle, spaceBox, zoomBy } from './pointer-helpers';

const card = (page: Page) => page.getByTestId('info-card').locator('strong');

async function closeCard(page: Page) {
  const close = page.getByTestId('info-card').getByRole('button', { name: 'Close' });
  if (await close.count()) await close.click();
}

/** Space numbers whose middle is on screen right now. */
function visibleSpaces(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    type N = { getClientRect: () => { x: number; y: number; width: number; height: number }; findOne: (s: string) => { text: () => string } | undefined };
    const st = (window as unknown as { Konva: { stages: { find: (s: string) => N[]; width: () => number; height: () => number }[] } }).Konva.stages[0];
    return st.find('.obj').flatMap((n) => {
      const t = n.findOne('Text')?.text();
      const r = n.getClientRect();
      const x = r.x + r.width / 2;
      const y = r.y + r.height / 2;
      return t && /^[A-Z]\d+$/.test(t) && x > 10 && x < st.width() - 80 && y > 10 && y < st.height() - 10 ? [t] : [];
    });
  });
}

/** Clicks the middle and four points near the edges of each space and checks the card names that space. */
async function clickSpaces(page: Page, labels: string[]) {
  const misses: string[] = [];
  let tried = 0;
  for (const label of labels) {
    for (const [fx, fy] of [[0, 0], [-0.38, 0], [0.38, 0], [0, -0.38], [0, 0.38]]) {
      const b = await spaceBox(page, label);
      if (!b || !b.inside) continue;
      tried++;
      await page.mouse.click(b.x + fx * b.w, b.y + fy * b.h);
      const got = await card(page).textContent({ timeout: 1000 }).catch(() => 'nothing');
      if (got !== `Space ${label}`) misses.push(`${label} @${fx},${fy} → ${got}`);
      await closeCard(page);
    }
  }
  return { misses, tried };
}

for (const size of [{ width: 1400, height: 860 }, { width: 1024, height: 700 }]) {
  test(`viewer: clicks land on the space under the mouse at every zoom (${size.width}px)`, async ({ page }) => {
    await page.setViewportSize(size);
    const id = await seedLot(page, { rows: 6, spacesPerRow: 30 });
    await page.goto(`/#/view/${id}`);
    await expect(page.getByTestId('viewer-facility')).toHaveText('Pointer Lot');
    await settle(page);
    for (const zoom of [0, -400, -400]) {
      if (zoom) await zoomBy(page, zoom);
      const labels = await visibleSpaces(page);
      const pick = labels.filter((_, i) => i % Math.max(1, Math.floor(labels.length / 8)) === 0).slice(0, 8);
      const { misses, tried } = await clickSpaces(page, pick);
      expect(misses, `zoom step ${zoom}`).toEqual([]);
      expect(tried).toBeGreaterThan(0);
    }
  });
}

test('viewer: clicking one space after another moves the highlight to the new one', async ({ page }) => {
  const id = await seedLot(page, { rows: 4, spacesPerRow: 16 });
  await page.goto(`/#/view/${id}`);
  await expect(page.getByTestId('viewer-facility')).toHaveText('Pointer Lot');
  await settle(page);
  for (const label of ['B3', 'B4', 'B5', 'C5', 'A16', 'D1']) {
    const b = (await spaceBox(page, label))!;
    await page.mouse.click(b.x, b.y);
    await expect(card(page)).toHaveText(`Space ${label}`);
  }
});

test('editor: select a row, drill into one space, then pick other spaces and rows', async ({ page }) => {
  const id = await seedLot(page, { rows: 4, spacesPerRow: 12 });
  await page.goto(`/#/edit/${id}`);
  await expect(page.getByTestId('canvas').locator('canvas').first()).toBeVisible();
  await settle(page);
  const click = async (label: string) => {
    const b = (await spaceBox(page, label))!;
    await page.mouse.click(b.x, b.y);
  };
  await click('C8');
  await expect.poll(() => editorSelection(page)).toHaveLength(12);
  const c8 = (await spaceBox(page, 'C8'))!;
  await page.mouse.dblclick(c8.x, c8.y);
  await expect.poll(() => editorSelection(page)).toEqual(['C8']);
  // Neighbors right next to the selection handles, and spaces further away.
  for (const label of ['C9', 'C7', 'C3']) {
    await click(label);
    await expect.poll(() => editorSelection(page)).toEqual([label]);
  }
  await click('B5');
  await expect.poll(async () => (await editorSelection(page)).length).toBe(12);
  expect(await editorSelection(page)).toContain('B5');
  await click('D2');
  expect(await editorSelection(page)).toContain('D2');
});

test('editor: a just-placed building moves with one drag, and drags again after reselecting', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('new-map').click();
  await page.getByTestId('map-name-input').fill('Drag Test');
  await page.getByTestId('mode-blank').click();
  await page.getByTestId('create-map').click();
  await expect(page.getByTestId('canvas').locator('canvas').first()).toBeVisible();
  await page.getByTestId('asset-search').fill('custom building');
  await page.getByTestId('asset-custom-building').first().click();
  const where = () => page.evaluate(() => {
    type N = { getClientRect: () => { x: number; y: number; width: number; height: number } };
    const st = (window as unknown as { Konva: { stages: { find: (s: string) => N[]; container: () => HTMLElement }[] } }).Konva.stages[0];
    const r = st.find('.obj')[0].getClientRect();
    const b = st.container().getBoundingClientRect();
    return { x: b.left + r.x + r.width / 2, y: b.top + r.y + r.height / 2 };
  });
  await expect.poll(async () => (await editorSelection(page)).length).toBe(1);
  const drag = async (dx: number, dy: number) => {
    const a = await where();
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(a.x + dx / 2, a.y + dy / 2, { steps: 4 });
    await page.mouse.move(a.x + dx, a.y + dy, { steps: 4 });
    await page.mouse.up();
    const b = await where();
    return { dx: b.x - a.x, dy: b.y - a.y };
  };
  const first = await drag(150, 80);
  expect(Math.abs(first.dx - 150)).toBeLessThan(25);
  expect(Math.abs(first.dy - 80)).toBeLessThan(25);
  // Deselect on empty map, then a press-and-drag on the building selects and moves it at once.
  const c = (await page.getByTestId('canvas').boundingBox())!;
  await page.mouse.click(c.x + 30, c.y + 30);
  await expect.poll(async () => (await editorSelection(page)).length).toBe(0);
  const second = await drag(-120, 40);
  expect(Math.abs(second.dx + 120)).toBeLessThan(25);
  expect(Math.abs(second.dy - 40)).toBeLessThan(25);
});

test('editor: a click on a neighbor right next to the selection handles picks the neighbor; the handle middle still resizes', async ({ page }) => {
  const id = await seedLot(page, { rows: 2, spacesPerRow: 10 });
  await page.goto(`/#/edit/${id}`);
  await expect(page.getByTestId('canvas').locator('canvas').first()).toBeVisible();
  await settle(page);
  const a5 = (await spaceBox(page, 'A5'))!;
  await page.mouse.click(a5.x, a5.y);
  await page.mouse.dblclick(a5.x, a5.y);
  await expect.poll(() => editorSelection(page)).toEqual(['A5']);
  // The middle of the handle as drawn (its position is the corner, which padding moves it away from).
  const anchor = (name: string) => page.evaluate((name) => {
    type A = { getClientRect: () => { x: number; y: number; width: number; height: number } };
    const st = (window as unknown as { Konva: { stages: { findOne: (s: string) => A; container: () => HTMLElement }[] } }).Konva.stages[0];
    const r = st.findOne(`.${name}`).getClientRect();
    const b = st.container().getBoundingClientRect();
    return { x: b.left + r.x + r.width / 2, y: b.top + r.y + r.height / 2 };
  }, name);
  // Just outside the middle of the right-hand handle, toward A6's number.
  const mr = await anchor('middle-right');
  await page.mouse.click(mr.x + 5, mr.y);
  await expect.poll(() => editorSelection(page)).toEqual(['A6']);
  const before = (await spaceBox(page, 'A6'))!;
  // Grab the right handle by its middle and pull: that still resizes A6.
  const h = await anchor('middle-right');
  await page.mouse.move(h.x, h.y);
  await page.mouse.down();
  await page.mouse.move(h.x + 20, h.y, { steps: 4 });
  await page.mouse.move(h.x + 40, h.y, { steps: 4 });
  await page.mouse.up();
  await expect.poll(async () => Math.round((await spaceBox(page, 'A6'))!.w - before.w)).toBeGreaterThan(20);
});
