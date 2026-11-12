import { devices, expect, test, type Page } from '@playwright/test';
import { addFromLibrary, drawRow, newMap } from './helpers';
import { Touch, editorState, realDrag, settle, toScreen, type ObjInfo } from './real-input';

/**
 * A whole job, start to finish, with real input: a manager draws a lot from a blank
 * map, adds a building with an inside, publishes, and an employee opens it on a phone,
 * searches, taps a space and goes inside the building.
 */

async function rowOf(page: Page, from: [number, number], to: [number, number], prefix: string) {
  await drawRow(page, from, to);
  await page.getByTestId('row-prefix').fill(prefix);
  await page.getByTestId('create-row').click();
  await page.keyboard.press('Escape');
}

/** Screen center of the viewer object whose label is `text`. */
async function viewerSpot(page: Page, text: string) {
  return page.evaluate((t) => {
    type N = { getClientRect: () => { x: number; y: number; width: number; height: number }; findOne: (s: string) => { text: () => string } | undefined };
    const st = (window as unknown as { Konva: { stages: { find: (s: string) => N[]; container: () => HTMLElement }[] } }).Konva.stages[0];
    const g = st.find('.obj').find((n) => n.findOne('Text')?.text() === t);
    if (!g) return null;
    const r = g.getClientRect();
    const b = st.container().getBoundingClientRect();
    return { x: b.left + r.x + r.width / 2, y: b.top + r.y + r.height / 2 };
  }, text);
}

test('draw a lot from blank, publish it, and use it as an employee on a phone', async ({ page, browser, browserName }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await newMap(page, 'Riverside Lot');
  await page.getByTestId('snap-mode').selectOption('free');

  // Two rows, drawn by dragging.
  await rowOf(page, [200, 160], [700, 160], 'A');
  await rowOf(page, [200, 420], [700, 420], 'B');
  const spaces = (await editorState(page)).objects.filter((o) => o.kind === 'space');
  expect(spaces.length).toBeGreaterThanOrEqual(16);
  expect(spaces.map((s) => s.name)).toContain('A1');
  expect(spaces.map((s) => s.name)).toContain('B1');

  // A building, moved off the rows, with a floor plan inside.
  await addFromLibrary(page, 'office-building');
  await page.getByTestId('asset-search').blur();
  const b = (await editorState(page)).objects.find((o) => o.name === 'Office 1') as ObjInfo;
  const c = (await page.getByTestId('canvas').boundingBox())!;
  await realDrag(page, await toScreen(page, b, { x: 0, y: 0 }), { x: c.x + c.width - 220, y: c.y + 300 });
  await page.getByTestId('enter-building').click();
  await addFromLibrary(page, 'reception-desk');
  await page.getByTestId('exit-building').click();

  // Stairs and a label.
  await addFromLibrary(page, 'stairs');
  await page.getByTestId('publish').click();
  await expect(page.getByTestId('publish')).toHaveAttribute('data-state', 'current');
  const id = page.url().split('/edit/')[1];

  // The employee's phone: real touch, a phone-sized screen.
  test.skip(browserName !== 'chromium', 'phone part sends touch through Chrome DevTools');
  const state = await page.context().storageState({ indexedDB: true });
  const phone = await browser.newContext({ ...devices['Pixel 7'], storageState: state, baseURL: test.info().project.use.baseURL });
  const p = await phone.newPage();
  await p.goto(`/#/view/${id}`);
  await expect(p.getByTestId('viewer-facility')).toHaveText('Riverside Lot');
  await expect(p.getByTestId('tool-row')).toHaveCount(0);

  // Search a space and pick it from the list.
  await p.getByTestId('viewer-search').tap();
  await p.keyboard.type('B3');
  await expect(p.getByTestId('search-results')).toContainText('B3');
  await p.getByTestId('search-results').getByText('B3', { exact: false }).first().tap();
  await expect(p.getByTestId('info-card')).toContainText('Space B3');

  // Tap another space directly.
  const touch = await Touch.open(p);
  await expect.poll(() => viewerSpot(p, 'A2')).not.toBeNull();
  await expect(async () => {
    const a2 = (await viewerSpot(p, 'A2'))!;
    await touch.tap(a2);
    await expect(p.getByTestId('info-card')).toContainText('Space A2', { timeout: 800 });
  }).toPass({ timeout: 8000 });

  // Search the building, tap it, go inside, find the desk, come back out.
  await p.getByTestId('viewer-search').fill('Office');
  await p.getByTestId('search-results').getByText('Office 1').first().tap();
  await expect(p.getByTestId('info-card')).toContainText('Office 1');
  await p.getByTestId('go-inside').tap();
  await expect(p.getByTestId('viewer-building')).toHaveText('Office 1');
  await p.getByTestId('viewer-search').fill('reception');
  await expect(p.getByTestId('search-results')).toContainText('Reception');
  await p.getByTestId('go-outside').tap();
  await expect(p.getByTestId('viewer-building')).toHaveCount(0);
  await touch.close();
  await phone.close();
});

test('editor on a phone: tap to select, drag a selected object, pinch to zoom', async ({ browser, browserName }) => {
  test.skip(browserName !== 'chromium', 'touch is sent through Chrome DevTools');
  const ctx = await browser.newContext({ ...devices['Pixel 7'], baseURL: test.info().project.use.baseURL });
  const page = await ctx.newPage();
  await newMap(page, 'Phone edit');
  await page.evaluate(async () => {
    const { useEditor } = await import('/src/editor/store.ts');
    const st = useEditor.getState();
    st.setSnapMode('free');
    st.addAsset('column', { x: 0, y: 0 });
    st.addAsset('stairs', { x: 200, y: 0 });
    st.clearSelection();
    st.fitToFloor();
  });
  await settle(page);
  const touch = await Touch.open(page);
  const objs = async () => (await editorState(page)).objects as ObjInfo[];
  const [col, stairs] = await objs();
  // Tap selects.
  await touch.tap(await toScreen(page, col, { x: 0, y: 0 }));
  expect((await editorState(page)).selection).toEqual([col.id]);
  // Tap another selects that one instead.
  await touch.tap(await toScreen(page, stairs, { x: 0, y: 0 }));
  expect((await editorState(page)).selection).toEqual([stairs.id]);
  // Dragging the selected object moves it; dragging the map pans.
  const from = await toScreen(page, stairs, { x: 0, y: 0 });
  await touch.drag(from, { x: from.x - 40, y: from.y + 60 });
  const moved = (await objs()).find((o) => o.id === stairs.id)!;
  expect(moved.y).toBeGreaterThan(stairs.y + 5);
  const v0 = (await editorState(page)).viewport;
  const a = await toScreen(page, col, { x: 0, y: 0 });
  const m = await toScreen(page, moved, { x: 0, y: 0 });
  await touch.pinch({ x: (a.x + m.x) / 2, y: (a.y + m.y) / 2 + 40 }, 1.4);
  await settle(page);
  expect((await editorState(page)).viewport.scale).toBeGreaterThan(v0.scale * 1.2);
  // After the pinch, a tap still picks the object under the finger.
  const colNow = (await objs()).find((o) => o.id === col.id)!;
  const tapAt = await toScreen(page, colNow, { x: 0, y: 0 });
  await touch.tap(tapAt);
  expect((await editorState(page)).selection).toEqual([col.id]);
  await touch.close();
  await ctx.close();
});
