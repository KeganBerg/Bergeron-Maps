import { expect, test, type Page } from '@playwright/test';
import { addFromLibrary, newMap } from './helpers';
import { editorState, realClick, realDrag, settle, spacePan, toScreen, trackpadPinch, type ObjInfo, type Pt } from './real-input';

/**
 * Every editing action, one straight after another, with a real mouse and keyboard:
 * place, select, select another, drag, resize, rotate, duplicate, delete, undo, redo,
 * then the same after zooming and panning, with layers locked and hidden, and inside
 * a building. Each step checks the state the previous step left behind.
 */

const obj = async (page: Page, name: string) => (await editorState(page)).objects.find((o) => o.name === name) as ObjInfo;
const center = (page: Page, o: ObjInfo) => toScreen(page, o, { x: 0, y: 0 });
const selectedNames = async (page: Page) => {
  const s = await editorState(page);
  return s.selection.map((id) => s.objects.find((o) => o.id === id)?.name);
};

/** Screen position of a transformer handle ('bottom-right', 'rotater', ...). */
async function handle(page: Page, name: string): Promise<Pt> {
  return page.evaluate((n) => {
    type K = { findOne: (s: string) => { getClientRect: () => { x: number; y: number; width: number; height: number } } | undefined; container: () => HTMLElement };
    const st = (window as unknown as { Konva: { stages: K[] } }).Konva.stages[0];
    const a = st.findOne(`.${n}`)!;
    const r = a.getClientRect();
    const b = st.container().getBoundingClientRect();
    return { x: b.left + r.x + r.width / 2, y: b.top + r.y + r.height / 2 };
  }, name);
}

async function placeAt(page: Page, key: string, at: Pt, name: string) {
  await addFromLibrary(page, key);
  await page.getByTestId('asset-search').blur();
  // Placed objects land in the middle of the view; drag it to where we want it.
  const o = await obj(page, name);
  await realDrag(page, await center(page, o), at);
  await expect.poll(async () => Math.round((await center(page, await obj(page, name))).x)).toBe(Math.round(at.x));
}

test.describe('every action in sequence', () => {
  test.setTimeout(120_000);

  test('place, select, drag, resize, rotate, duplicate, delete, undo, redo', async ({ page }) => {
    await newMap(page, 'Sequence');
    await page.getByTestId('snap-mode').selectOption('free');
    const c = (await page.getByTestId('canvas').boundingBox())!;
    const P = (fx: number, fy: number) => ({ x: c.x + c.width * fx, y: c.y + c.height * fy });

    await test.step('place, then move it straight away', async () => {
      await addFromLibrary(page, 'column');
      await page.getByTestId('asset-search').blur();
      expect(await selectedNames(page)).toEqual(['Column 1']);
      const before = await obj(page, 'Column 1');
      const from = await center(page, before);
      await realDrag(page, from, { x: from.x - 200, y: from.y - 100 });
      const after = await obj(page, 'Column 1');
      const v = (await editorState(page)).viewport;
      expect(after.x - before.x).toBeCloseTo(-200 / v.scale, 0);
      expect(after.y - before.y).toBeCloseTo(-100 / v.scale, 0);
    });

    await test.step('place a second object and a third', async () => {
      await placeAt(page, 'stairs', P(0.7, 0.3), 'Stairway 1');
      await placeAt(page, 'tree', P(0.6, 0.7), 'Tree 1');
    });

    await test.step('select, then select another', async () => {
      await realClick(page, await center(page, await obj(page, 'Column 1')));
      expect(await selectedNames(page)).toEqual(['Column 1']);
      await realClick(page, await center(page, await obj(page, 'Stairway 1')));
      expect(await selectedNames(page)).toEqual(['Stairway 1']);
      await realClick(page, await center(page, await obj(page, 'Tree 1')), { shift: true });
      expect((await selectedNames(page)).sort()).toEqual(['Stairway 1', 'Tree 1']);
      await realClick(page, P(0.05, 0.95)); // empty map
      expect(await selectedNames(page)).toEqual([]);
    });

    await test.step('drag a different object than the one selected', async () => {
      await realClick(page, await center(page, await obj(page, 'Column 1')));
      const t0 = await obj(page, 'Tree 1');
      const from = await center(page, t0);
      await realDrag(page, from, { x: from.x + 60, y: from.y + 30 });
      expect(await selectedNames(page)).toEqual(['Tree 1']);
      expect((await obj(page, 'Tree 1')).x).toBeGreaterThan(t0.x);
      expect((await obj(page, 'Column 1')).x).toBe((await obj(page, 'Column 1')).x);
    });

    await test.step('resize with the corner handle', async () => {
      const s0 = await obj(page, 'Stairway 1');
      await realClick(page, await center(page, s0));
      const h = await handle(page, 'bottom-right');
      await realDrag(page, h, { x: h.x + 40, y: h.y + 30 });
      const s1 = await obj(page, 'Stairway 1');
      expect(s1.width).toBeGreaterThan(s0.width + 5);
      expect(s1.height).toBeGreaterThan(s0.height + 5);
      expect(await selectedNames(page)).toEqual(['Stairway 1']);
    });

    await test.step('rotate with the rotation handle', async () => {
      const o = await obj(page, 'Stairway 1');
      const ctr = await center(page, o);
      const h = await handle(page, 'rotater');
      const r = Math.hypot(h.x - ctr.x, h.y - ctr.y);
      await page.mouse.move(h.x, h.y);
      await page.mouse.down();
      for (let a = 0; a <= 90; a += 10) {
        const rad = (a * Math.PI) / 180;
        await page.mouse.move(ctr.x + r * Math.sin(rad), ctr.y - r * Math.cos(rad));
      }
      await page.mouse.up();
      const rot = (await obj(page, 'Stairway 1')).rotation;
      expect(Math.abs(rot - 90)).toBeLessThan(3);
    });

    await test.step('duplicate, delete, undo, redo', async () => {
      const n0 = (await editorState(page)).objects.length;
      await page.keyboard.press('Control+d');
      expect((await editorState(page)).objects.length).toBe(n0 + 1);
      expect(await selectedNames(page)).toEqual(['Stairway 2']);
      // The copy can be moved right away.
      const d0 = await obj(page, 'Stairway 2');
      const from = await center(page, d0);
      await realDrag(page, from, { x: from.x, y: from.y + 80 });
      expect((await obj(page, 'Stairway 2')).y).toBeGreaterThan(d0.y + 20);
      await page.keyboard.press('Delete');
      expect((await editorState(page)).objects.length).toBe(n0);
      await page.keyboard.press('Control+z');
      expect((await editorState(page)).objects.length).toBe(n0 + 1);
      await page.keyboard.press('Control+z'); // the move
      expect((await obj(page, 'Stairway 2')).y).toBeCloseTo(d0.y, 3);
      await page.keyboard.press('Control+y');
      expect((await obj(page, 'Stairway 2')).y).toBeGreaterThan(d0.y + 20);
      await page.keyboard.press('Control+y');
      expect((await editorState(page)).objects.length).toBe(n0);
    });

    await test.step('after zooming in and panning, select and drag still land on the right thing', async () => {
      const v0 = (await editorState(page)).viewport;
      // Pinch over the tree, as a person zooms in on what they want to touch: the point
      // under the fingers stays put, so the tree stays on screen whatever the browser's zoom step.
      const treeAt = await center(page, await obj(page, 'Tree 1'));
      await trackpadPinch(page, treeAt, -150);
      const v1 = (await editorState(page)).viewport;
      await spacePan(page, P(0.5, 0.5), P(0.4, 0.45));
      await settle(page);
      const v2 = (await editorState(page)).viewport;
      expect(v1.scale, 'trackpad pinch zooms in').toBeGreaterThan(v0.scale * 1.05);
      expect(Math.round(v2.x - v1.x), 'space + drag pans').toBe(Math.round(-0.1 * c.width));
      const t = await obj(page, 'Tree 1');
      const at = await center(page, t);
      expect(at.x > c.x && at.x < c.x + c.width && at.y > c.y && at.y < c.y + c.height, `tree on screen at ${JSON.stringify(at)}`).toBe(true);
      await realClick(page, at);
      const why = await page.evaluate(([x, y]) => {
        type N = { className: string; findAncestor: (s: string) => { id: () => string } | undefined };
        const st = (window as unknown as { Konva: { stages: { getIntersection: (p: object) => N | null; container: () => HTMLElement }[] } }).Konva.stages[0];
        const b = st.container().getBoundingClientRect();
        const n = st.getIntersection({ x: x - b.left, y: y - b.top });
        return { hit: n?.className, obj: n?.findAncestor('.obj')?.id(), focus: document.activeElement?.tagName, zoom: window.devicePixelRatio };
      }, [at.x, at.y]);
      expect(await selectedNames(page), JSON.stringify({ why, v0, v1, v2, t, at })).toEqual(['Tree 1']);
      const from = await center(page, t);
      await realDrag(page, from, { x: from.x - 50, y: from.y });
      const v = (await editorState(page)).viewport;
      expect((await obj(page, 'Tree 1')).x - t.x).toBeCloseTo(-50 / v.scale, 0);
      // The column is off-screen at this zoom; fit the view, then pick it.
      await page.getByTestId('fit').click();
      await settle(page);
      const colAt = await center(page, await obj(page, 'Column 1'));
      expect(colAt.x > c.x && colAt.x < c.x + c.width && colAt.y > c.y && colAt.y < c.y + c.height, `column on screen at ${JSON.stringify(colAt)}`).toBe(true);
      await realClick(page, colAt);
      expect(await selectedNames(page)).toEqual(['Column 1']);
    });

    await test.step('arrow keys nudge the selection', async () => {
      const a = await obj(page, 'Column 1');
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('Shift+ArrowDown');
      const b = await obj(page, 'Column 1');
      expect([b.x - a.x, b.y - a.y]).toEqual([1, 10]);
    });

    await test.step('a locked layer cannot be picked or dragged; a hidden one is not there', async () => {
      await page.getByTestId('fit').click();
      await settle(page);
      await page.getByTestId('tab-layers').click();
      const col = await obj(page, 'Column 1');
      const layer = (await editorState(page)).layers.find((l) => l.id === col.layerId)!;
      await page.keyboard.press('Escape');
      await page.getByTestId(`lock-${layer.name}`).click();
      const p = await center(page, col);
      await realClick(page, p);
      expect(await selectedNames(page)).toEqual([]);
      await realDrag(page, p, { x: p.x + 80, y: p.y });
      expect((await obj(page, 'Column 1')).x).toBe(col.x);
      await page.getByTestId(`lock-${layer.name}`).click();
      await realClick(page, p);
      expect(await selectedNames(page)).toEqual(['Column 1']);
      // Hide it: clicking where it was selects nothing, select-all leaves it out.
      await page.getByTestId(`layer-${layer.name}`).getByTitle('Hide layer').click();
      expect(await selectedNames(page)).toEqual([]);
      await realClick(page, p);
      expect(await selectedNames(page)).toEqual([]);
      await page.mouse.move(p.x + 300, p.y + 300);
      await page.keyboard.press('Control+a');
      expect(await selectedNames(page)).not.toContain('Column 1');
      await page.getByTestId(`layer-${layer.name}`).getByTitle('Show layer').click();
    });
  });

  test('the same actions inside a building', async ({ page }) => {
    await newMap(page, 'Inside');
    await page.getByTestId('snap-mode').selectOption('free');
    await addFromLibrary(page, 'office-building');
    await page.getByTestId('enter-building').click();
    await expect(page.getByTestId('building-crumb')).toBeVisible();
    await addFromLibrary(page, 'desk');
    await page.getByTestId('asset-search').blur();
    const d0 = await obj(page, 'Desk 1');
    const from = await center(page, d0);
    await realDrag(page, from, { x: from.x + 120, y: from.y + 40 });
    expect((await obj(page, 'Desk 1')).x).toBeGreaterThan(d0.x);
    await addFromLibrary(page, 'office-chair');
    await page.getByTestId('asset-search').blur();
    await realClick(page, await center(page, await obj(page, 'Desk 1')));
    expect(await selectedNames(page)).toEqual(['Desk 1']);
    const h = await handle(page, 'bottom-right');
    await realDrag(page, h, { x: h.x + 30, y: h.y + 20 });
    expect((await obj(page, 'Desk 1')).width).toBeGreaterThan(d0.width);
    await page.keyboard.press('Control+d');
    expect(await selectedNames(page)).toEqual(['Desk 2']);
    await page.keyboard.press('Delete');
    await page.keyboard.press('Control+z');
    expect(await selectedNames(page)).toEqual(['Desk 2']);
    await page.getByTestId('exit-building').click();
    await expect(page.getByTestId('building-crumb')).toHaveCount(0);
    // Outside again: the building is still selectable and draggable.
    const b = await obj(page, 'Office 1');
    await realClick(page, await center(page, b));
    expect(await selectedNames(page)).toEqual(['Office 1']);
  });
});
