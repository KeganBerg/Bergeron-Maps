import { expect, test, type Page } from '@playwright/test';
import { addFromLibrary, newMap } from './helpers';

/** The selected zone's name/symbol settings, straight from the editor store. */
function zoneState(page: Page) {
  return page.evaluate(async () => {
    const { useEditor, currentFloor } = await import('/src/editor/store.ts');
    const s = useEditor.getState();
    const o = currentFloor(s)!.objects.find((x) => x.id === s.selection[0]) as { labelHidden?: boolean; labelLayout?: Record<string, unknown> };
    return { labelHidden: !!o.labelHidden, labelLayout: o.labelLayout ?? null, canUndo: s.past.length };
  });
}

test('zone name can be hidden, dragged, resized and reset to center', async ({ page }) => {
  await newMap(page, 'Label Test');
  await addFromLibrary(page, 'custom-zone');
  await page.getByTestId('asset-label').fill('Service');
  await page.getByTestId('asset-label').press('Enter');

  // Hide and show the name.
  await page.getByTestId('label-toggle').uncheck();
  expect((await zoneState(page)).labelHidden).toBe(true);
  await expect(page.getByTestId('label-handle-text')).toHaveCount(0);
  await page.getByTestId('label-toggle').check();
  expect((await zoneState(page)).labelHidden).toBe(false);

  // Drag the name to the top-left corner of the zone picture.
  await page.getByTestId('label-adjust').locator('summary').click();
  const pad = (await page.getByTestId('label-pad').boundingBox())!;
  const text = (await page.getByTestId('label-handle-text').boundingBox())!;
  const before = await zoneState(page);
  await page.mouse.move(text.x + text.width / 2, text.y + text.height / 2);
  await page.mouse.down();
  await page.mouse.move(pad.x + pad.width * 0.3, pad.y + pad.height * 0.4, { steps: 3 });
  await page.mouse.move(pad.x + pad.width * 0.25, pad.y + pad.height * 0.2, { steps: 3 });
  await page.mouse.up();
  let st = await zoneState(page);
  const at = (st.labelLayout as { text: { x: number; y: number } }).text;
  expect(at.x).toBeCloseTo(0.25, 1);
  expect(at.y).toBeCloseTo(0.2, 1);
  // One drag = one undo step.
  expect(st.canUndo).toBe(before.canUndo + 1);

  // Move the symbol with the keyboard.
  await page.getByTestId('label-handle-symbol').focus();
  await page.keyboard.press('ArrowRight');
  st = await zoneState(page);
  expect((st.labelLayout as { symbol: { x: number } }).symbol.x).toBeCloseTo(0.52, 2);

  // Sizes.
  await page.getByTestId('label-text-size').fill('200');
  await page.getByTestId('label-symbol-size').fill('60');
  st = await zoneState(page);
  expect(st.labelLayout).toMatchObject({ textScale: 2, symbolScale: 0.6 });

  await page.getByTestId('label-adjust').screenshot({ path: 'test-results/label-adjust-panel.png' });

  // Reset puts it all back.
  await page.getByTestId('label-reset').click();
  expect((await zoneState(page)).labelLayout).toBeNull();
  await expect(page.getByTestId('label-reset')).toBeDisabled();
});
