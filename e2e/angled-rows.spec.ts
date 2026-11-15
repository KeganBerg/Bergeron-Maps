import { expect, test } from '@playwright/test';
import { drawRow, newMap, waitSaved } from './helpers';

const shots = process.env.SHOTS_DIR;

/** Number, font size and on-screen middle of every space on the canvas. */
function spaceLabels(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    type T = { text: () => string; fontSize: () => number };
    type N = { getClientRect: () => { x: number; y: number; width: number; height: number }; findOne: (s: string) => T | undefined };
    const st = (window as unknown as { Konva: { stages: { find: (s: string) => N[] }[] } }).Konva.stages[0];
    return st.find('.obj').flatMap((g) => {
      const t = g.findOne('Text');
      return t ? [{ label: t.text(), size: t.fontSize() }] : [];
    });
  });
}

test('a row of angled spaces, picked by angle, with bigger numbers that show in the viewer', async ({ page }) => {
  await newMap(page, 'Angled Lot');
  await drawRow(page, [120, 220], [760, 220]);
  await page.getByTestId('row-count').fill('8');
  await page.getByTestId('row-prefix').fill('B');
  await page.getByTestId('row-angle').selectOption('45');
  await expect(page.getByTestId('row-lean')).toBeVisible();
  if (shots) await page.screenshot({ path: `${shots}/dialog.png` });
  await page.getByTestId('create-row').click();
  await expect(page.getByTestId('selected-name')).toHaveText('Row B1–B8');

  const spaces = await page.evaluate(async () => {
    const { useEditor, currentFloor } = await import('/src/editor/store.ts');
    return currentFloor(useEditor.getState())!.objects.filter((o) => o.kind === 'space');
  });
  expect(spaces).toHaveLength(8);
  expect(spaces.every((s) => s.kind === 'space' && s.variant === 'angled' && Math.abs((s.skew ?? 0) - 90) < 0.5)).toBe(true);
  // Neighbours touch: their centres are one stall apart along the row (45 / sin 45°).
  expect(spaces[1].x - spaces[0].x).toBeCloseTo(45 / Math.SQRT1_2, 0);

  // The row's settings show the angle and can switch the lean.
  await expect(page.getByTestId('row-angle')).toHaveValue('45');
  await page.getByTestId('row-lean').selectOption('left');
  await expect(page.getByTestId('selected-name')).toHaveText('Row B1–B8');

  // Bigger numbers for the whole row, then reset.
  const before = (await spaceLabels(page)).find((l) => l.label === 'B3')!.size;
  await page.getByTestId('number-bigger').click();
  await page.getByTestId('number-bigger').click();
  await page.getByTestId('number-bigger').click();
  await expect(page.getByTestId('number-size-input')).toHaveValue('130');
  const bigger = (await spaceLabels(page)).find((l) => l.label === 'B3')!.size;
  expect(bigger).toBeGreaterThan(before * 1.2);
  if (shots) await page.screenshot({ path: `${shots}/editor-bigger-numbers.png` });
  await page.getByTestId('number-size-reset').click();
  await expect(page.getByTestId('number-size-input')).toHaveValue('100');
  expect((await spaceLabels(page)).find((l) => l.label === 'B3')!.size).toBeCloseTo(before, 1);

  // Smaller numbers, typed in.
  await page.getByTestId('number-size-input').fill('60');
  await page.getByTestId('number-size-input').press('Enter');
  const smaller = (await spaceLabels(page)).find((l) => l.label === 'B3')!.size;
  expect(smaller).toBeLessThan(before * 0.75);
  await page.getByTestId('number-size-input').fill('120');
  await page.getByTestId('number-size-input').press('Enter');
  await waitSaved(page);
  const sizeInEditor = (await spaceLabels(page)).find((l) => l.label === 'B3')!.size;

  // The viewer draws the same angled stalls and number size.
  const id = await page.evaluate(async () => (await import('/src/editor/store.ts')).useEditor.getState().doc!.id);
  await page.evaluate(async (id) => {
    const { repository } = await import('/src/storage/indexedDbRepository.ts');
    await repository.publishMap(id);
  }, id);
  await page.goto(`/#/view/${id}`);
  await expect(page.locator('canvas').first()).toBeVisible();
  await page.waitForTimeout(500);
  const viewer = (await spaceLabels(page)).find((l) => l.label === 'B3');
  expect(viewer?.size).toBeCloseTo(sizeInEditor, 1);
  if (shots) await page.screenshot({ path: `${shots}/viewer.png` });
});

test('clicking an angled stall selects that stall, not its overlapping neighbour', async ({ page }) => {
  await newMap(page, 'Click Lot');
  await page.getByTestId('add-row').click();
  await page.getByTestId('row-count').fill('6');
  await page.getByTestId('row-angle').selectOption('45');
  await page.getByTestId('create-row').click();
  await page.keyboard.press('Escape');
  // Click the middle of space 3's own number.
  const at = await page.evaluate(() => {
    type N = { getClientRect: () => { x: number; y: number; width: number; height: number }; text: () => string; getParent: () => unknown };
    const st = (window as unknown as { Konva: { stages: { find: (s: string) => N[]; container: () => HTMLElement }[] } }).Konva.stages[0];
    const t = st.find('Text').find((n) => n.text() === '3')!;
    const r = t.getClientRect();
    const b = st.container().getBoundingClientRect();
    return { x: b.left + r.x + r.width / 2, y: b.top + r.y + r.height / 2 };
  });
  await page.mouse.click(at.x, at.y);
  await page.mouse.click(at.x, at.y);
  await expect(page.getByTestId('space-label')).toHaveValue('3');
});
