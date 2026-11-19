import { expect, test, type Page } from '@playwright/test';
import { editorSelection, seedLot, settle, spaceBox } from './pointer-helpers';
import { editorState } from './real-input';

/**
 * Editing the map with fingers, on phone and tablet sizes (touch sent through Chrome DevTools,
 * which fires the same pointer events a phone does).
 *
 * Drags here slow down before the finger lifts. A quick flick makes Chrome start a fling, and
 * its next tap only stops the fling, so a button tapped straight after was ignored in tests.
 */
type Pt = { x: number; y: number };

async function fingers(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  const send = (type: 'touchStart' | 'touchMove' | 'touchEnd', pts: Pt[]) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, i) => ({ x: p.x, y: p.y, id: i })) });
  const f = {
    async tap(p: Pt) {
      await send('touchStart', [p]);
      await send('touchEnd', []);
      await page.waitForTimeout(60);
    },
    async doubleTap(p: Pt) {
      await f.tap(p);
      await page.waitForTimeout(40);
      await f.tap(p);
    },
    async hold(p: Pt, ms = 700) {
      await send('touchStart', [p]);
      await page.waitForTimeout(ms);
      await send('touchEnd', []);
      await page.waitForTimeout(60);
    },
    async drag(from: Pt, to: Pt, steps = 10) {
      await send('touchStart', [from]);
      for (let i = 1; i <= steps; i++) await send('touchMove', [{ x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps }]);
      for (let i = 0; i < 4; i++) {
        await page.waitForTimeout(40);
        await send('touchMove', [to]);
      }
      await send('touchEnd', []);
      await page.waitForTimeout(60);
    },
    async pinch(at: Pt, factor: number) {
      const pts = (d: number) => [{ x: at.x - d, y: at.y }, { x: at.x + d, y: at.y }];
      await send('touchStart', [pts(40)[0]]);
      await send('touchStart', pts(40));
      for (let i = 1; i <= 8; i++) await send('touchMove', pts(40 + (40 * factor - 40) * (i / 8)));
      await send('touchEnd', [pts(40 * factor)[0]]);
      await send('touchEnd', []);
    },
  };
  return f;
}

async function openLot(page: Page) {
  const id = await seedLot(page, { rows: 4, spacesPerRow: 8 });
  await page.goto(`/#/edit/${id}`);
  await expect(page.getByTestId('canvas').locator('canvas').first()).toBeVisible();
  await settle(page);
  return fingers(page);
}

const obj = async (page: Page, name: string) => (await editorState(page)).objects.find((o) => o.name === name)!;

/** Empty map near the canvas's right edge, beside the lot. */
async function emptySpot(page: Page): Promise<Pt> {
  const c = (await page.getByTestId('canvas').boundingBox())!;
  return { x: c.x + c.width - 20, y: c.y + c.height - 20 };
}

test.describe('phone', () => {
  test('press and hold a space opens the map menu, and Delete works from it', async ({ page }) => {
    const f = await openLot(page);
    const n = (await editorState(page)).objects.length;
    await f.hold((await spaceBox(page, 'B3'))!);
    const menu = page.getByTestId('canvas-menu');
    await expect(menu).toBeVisible();
    // The hold picked the row under the finger, as a right-click does.
    expect(await editorSelection(page)).toHaveLength(8);
    await expect(menu.getByTestId('menu-box-select')).toBeVisible();
    await menu.getByTestId('menu-delete').tap();
    await expect(menu).toHaveCount(0);
    await expect.poll(async () => (await editorState(page)).objects.length).toBe(n - 8);
  });

  test('lifting the finger after a hold does not also select or pan', async ({ page }) => {
    const f = await openLot(page);
    const v0 = (await editorState(page)).viewport;
    await f.hold(await emptySpot(page));
    await expect(page.getByTestId('canvas-menu')).toBeVisible();
    expect(await editorSelection(page)).toEqual([]);
    expect((await editorState(page)).viewport).toEqual(v0);
  });

  test('a finger that moves is a pan, not a hold', async ({ page }) => {
    const f = await openLot(page);
    const v0 = (await editorState(page)).viewport;
    const p = await emptySpot(page);
    await f.drag(p, { x: p.x - 60, y: p.y - 80 }, 6);
    await page.waitForTimeout(600);
    await expect(page.getByTestId('canvas-menu')).toHaveCount(0);
    expect((await editorState(page)).viewport.x).not.toBe(v0.x);
  });

  test('"Select an area" lets one finger drag a selection box instead of panning', async ({ page }) => {
    const f = await openLot(page);
    await f.hold(await emptySpot(page));
    await page.getByTestId('menu-box-select').tap();
    const v0 = (await editorState(page)).viewport;
    const b1 = (await spaceBox(page, 'B1'))!;
    const c2 = (await spaceBox(page, 'C2'))!;
    await f.drag({ x: b1.x - b1.w, y: b1.y - b1.h * 0.7 }, { x: c2.x + c2.w * 0.4, y: c2.y + c2.h * 0.7 });
    expect((await editorState(page)).viewport).toEqual(v0);
    // A box selects whole rows, as with the mouse.
    const spaces = (await editorSelection(page)).filter((l) => /^[A-D]\d+$/.test(l)).sort();
    expect(spaces).toEqual(['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8'].sort());
    // Only once: the next drag on empty map pans again.
    const c = (await page.getByTestId('canvas').boundingBox())!;
    const p = { x: c.x + 20, y: c.y + 20 };
    await f.drag(p, { x: p.x - 50, y: p.y - 50 }, 6);
    expect((await editorState(page)).viewport.x).not.toBe(v0.x);
  });

  test('double tap on a picked space opens the side panel at its number', async ({ page }) => {
    const f = await openLot(page);
    await expect(page.getByLabel('Show sidebar')).toBeVisible();
    const a3 = (await spaceBox(page, 'A3'))!;
    // Taps more than Konva's double-tap time apart, so each pair counts on its own.
    await f.tap(a3);
    await page.waitForTimeout(500);
    await f.doubleTap(a3);
    await expect.poll(() => editorSelection(page)).toEqual(['A3']);
    await expect(page.getByLabel('Show sidebar')).toBeVisible();
    await page.waitForTimeout(500);
    await f.doubleTap((await spaceBox(page, 'A3'))!);
    await expect(page.getByLabel('Hide sidebar')).toBeVisible();
    await expect(page.getByTestId('space-label')).toBeFocused();
    await expect(page.getByTestId('space-label')).toHaveValue('A3');
  });

  test('quick taps that pick a row and then one space leave the side panel shut', async ({ page }) => {
    const f = await openLot(page);
    const a3 = (await spaceBox(page, 'A3'))!;
    await f.tap(a3);
    await f.doubleTap(a3);
    await expect.poll(() => editorSelection(page)).toEqual(['A3']);
    await page.waitForTimeout(200);
    await expect(page.getByLabel('Show sidebar')).toBeVisible();
  });

  test('a text label placed with a finger opens its field to type in', async ({ page }) => {
    const f = await openLot(page);
    await page.getByTestId('tool-text').tap();
    await f.tap(await emptySpot(page));
    await expect.poll(async () => (await editorState(page)).objects.filter((o) => o.kind === 'text').length).toBe(1);
    const field = page.locator('.properties input:focus');
    await expect(field).toHaveCount(1);
  });
});

test.describe('tablet', () => {
  test.use({ viewport: { width: 810, height: 1080 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

  test('finger resize, rotate, move and pinch on a picked space', async ({ page }) => {
    const f = await openLot(page);
    const a3 = (await spaceBox(page, 'A3'))!;
    await f.tap(a3);
    await page.waitForTimeout(150);
    await f.doubleTap(a3);
    await expect.poll(() => editorSelection(page)).toEqual(['A3']);
    const handles = () => page.evaluate(() => {
      type N = { name: () => string; hasName: (n: string) => boolean; getClientRect: () => { x: number; y: number; width: number; height: number } };
      const st = (window as unknown as { Konva: { stages: { findOne: (s: string) => { children: N[] }; container: () => HTMLElement }[] } }).Konva.stages[0];
      const b = st.container().getBoundingClientRect();
      return Object.fromEntries(st.findOne('Transformer').children.filter((c) => c.hasName('_anchor')).map((c) => {
        const r = c.getClientRect();
        return [c.name().split(' ')[0], { x: b.left + r.x + r.width / 2, y: b.top + r.y + r.height / 2 }];
      }));
    });
    const start = await obj(page, 'A3');
    const br = (await handles())['bottom-right'];
    await f.drag(br, { x: br.x + 30, y: br.y + 30 });
    const resized = await obj(page, 'A3');
    expect(resized.width).toBeGreaterThan(start.width + 10);
    expect(resized.height).toBeGreaterThan(start.height + 10);
    const rot = (await handles()).rotater;
    await f.drag(rot, { x: rot.x + 120, y: rot.y + 120 });
    const turned = await obj(page, 'A3');
    expect(turned.rotation).toBeGreaterThan(20);
    expect(await editorSelection(page)).toEqual(['A3']);
    const p = (await spaceBox(page, 'A3'))!;
    await f.drag(p, { x: p.x + 50, y: p.y + 70 });
    const moved = await obj(page, 'A3');
    expect(Math.hypot(moved.x - turned.x, moved.y - turned.y)).toBeGreaterThan(40);
    // Two fingers over the picked space zoom the map and leave the space where it is.
    const s0 = (await editorState(page)).viewport.scale;
    await f.pinch((await spaceBox(page, 'A3'))!, 1.6);
    await expect.poll(async () => (await editorState(page)).viewport.scale).toBeGreaterThan(s0 * 1.3);
    const after = await obj(page, 'A3');
    expect([after.x, after.y]).toEqual([moved.x, moved.y]);
    // Undo with the top bar button takes back the last edit.
    await page.getByTestId('undo').tap();
    await expect.poll(async () => (await obj(page, 'A3')).x).toBe(turned.x);
  });

  test('a row drawn with a finger is created from its dialog', async ({ page }) => {
    const f = await openLot(page);
    const n = (await editorState(page)).objects.length;
    await page.getByTestId('tool-row').tap();
    const c = (await page.getByTestId('canvas').boundingBox())!;
    // Holding still with the row tool is a tap that places a row, not the map menu.
    await f.hold({ x: c.x + c.width - 40, y: c.y + 60 }, 700);
    await expect(page.getByTestId('create-row')).toBeVisible();
    await expect(page.getByTestId('canvas-menu')).toHaveCount(0);
    // Tapping the dim backdrop still closes it.
    await f.tap({ x: c.x + c.width - 10, y: c.y + c.height - 10 });
    await expect(page.getByTestId('create-row')).toHaveCount(0);
    await page.getByTestId('tool-row').tap();
    await f.drag({ x: c.x + c.width - 40, y: c.y + 60 }, { x: c.x + c.width - 40, y: c.y + c.height - 80 });
    const create = page.getByTestId('create-row');
    await expect(create).toBeVisible();
    const count = Number((await create.textContent())!.match(/\d+/)![0]);
    expect(count).toBeGreaterThan(5);
    await create.tap();
    await expect(create).toHaveCount(0);
    await expect.poll(async () => (await editorState(page)).objects.length).toBe(n + count);
  });

  test('press and hold works with the sidebar open, and the menu fits on screen', async ({ page }) => {
    const f = await openLot(page);
    await f.hold((await spaceBox(page, 'D8'))!);
    const menu = page.getByTestId('canvas-menu');
    await expect(menu).toBeVisible();
    const b = (await menu.boundingBox())!;
    const vp = page.viewportSize()!;
    expect(b.x + b.width).toBeLessThanOrEqual(vp.width);
    expect(b.y).toBeGreaterThanOrEqual(0);
    // Finger-sized items.
    expect((await menu.getByTestId('menu-delete').boundingBox())!.height).toBeGreaterThanOrEqual(40);
    // Tapping the map elsewhere closes it.
    await f.tap(await emptySpot(page));
    await expect(menu).toHaveCount(0);
  });
});
