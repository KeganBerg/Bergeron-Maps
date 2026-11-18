import { expect, test, type Page } from '@playwright/test';
import { addFromLibrary, newMap } from './helpers';

/** The selected curve: its fields and where its four handles are on screen. */
function curveState(page: Page) {
  return page.evaluate(async () => {
    const { useEditor, currentFloor } = await import('/src/editor/store.ts');
    const { curvePx } = await import('/src/model/curve.ts');
    const { toWorld } = await import('/src/model/shape.ts');
    const { bandOf } = await import('/src/editor/CurveHandles.tsx');
    const s = useEditor.getState();
    const o = currentFloor(s)!.objects.find((x) => x.id === s.selection[0]);
    if (!o || o.kind !== 'asset') throw new Error('no curve selected');
    const p = curvePx(o, bandOf(o));
    const v = s.viewport;
    const world = [0, 1, 2, 3].map((k) => toWorld(o, p[k * 2], p[k * 2 + 1]));
    return {
      curve: o.curve ?? null,
      world,
      screen: world.map(([x, y]) => ({ x: x * v.scale + v.x, y: y * v.scale + v.y })),
      scale: v.scale,
      canUndo: s.past.length,
    };
  });
}

test('a curved road bends with its handles to match the photo, and undo puts it back', async ({ page }) => {
  await newMap(page, 'Curve Test');
  await addFromLibrary(page, 'curved-road');
  await expect(page.getByTestId('curve-hint')).toBeVisible();
  await expect(page.getByTestId('curve-reset')).toHaveCount(0);
  const c = (await page.getByTestId('canvas').boundingBox())!;
  const before = await curveState(page);
  expect(before.curve).toBeNull();

  // Pull the far end's bend handle out: the road runs further before it turns.
  const h = before.screen[2];
  await page.mouse.move(c.x + h.x, c.y + h.y);
  await page.mouse.down();
  await page.mouse.move(c.x + h.x + 20, c.y + h.y - 40, { steps: 4 });
  await page.mouse.move(c.x + h.x + 40, c.y + h.y - 80, { steps: 4 });
  await page.mouse.up();
  const bent = await curveState(page);
  expect(bent.curve).not.toBeNull();
  // The handle followed the mouse; both ends stayed put.
  const moved = { x: before.world[2][0] + 40 / bent.scale, y: before.world[2][1] - 80 / bent.scale };
  expect(Math.hypot(bent.world[2][0] - moved.x, bent.world[2][1] - moved.y)).toBeLessThan(2 / bent.scale + 1);
  for (const k of [0, 3]) expect(Math.hypot(bent.world[k][0] - before.world[k][0], bent.world[k][1] - before.world[k][1])).toBeLessThan(1);
  expect(bent.canUndo).toBe(before.canUndo + 1);

  // Move the far end: its bend handle comes along.
  const e = bent.screen[3];
  await page.mouse.move(c.x + e.x, c.y + e.y);
  await page.mouse.down();
  await page.mouse.move(c.x + e.x + 30, c.y + e.y + 30, { steps: 6 });
  await page.mouse.up();
  const ended = await curveState(page);
  expect(ended.world[3][0] - bent.world[3][0]).toBeCloseTo(30 / ended.scale, 0);
  expect(ended.world[2][0] - bent.world[2][0]).toBeCloseTo(30 / ended.scale, 0);

  // Undo twice: back to the quarter circle it started as.
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  expect((await curveState(page)).curve).toBeNull();

  // Redo, then reset from the panel.
  await page.keyboard.press('Control+y');
  await expect(page.getByTestId('curve-reset')).toBeVisible();
  await page.getByTestId('curve-reset').click();
  expect((await curveState(page)).curve).toBeNull();
});
