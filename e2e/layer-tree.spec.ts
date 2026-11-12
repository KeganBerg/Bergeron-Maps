import { expect, test } from '@playwright/test';
import { addFromLibrary, clickCanvas, drawRow, newMap } from './helpers';

test('selecting a layer lists its objects, and the list and canvas select each other', async ({ page }) => {
  await newMap(page, 'Layer tree');
  await drawRow(page, [300, 300], [700, 300]);
  await page.getByTestId('row-count').fill('6');
  await page.getByTestId('create-row').click();
  await page.keyboard.press('Escape');
  await addFromLibrary(page, 'stairs');
  await page.getByTestId('tab-layers').click();

  // Clicking a layer opens it.
  await page.getByTestId('layer-Parking spaces').click();
  const spaces = page.getByTestId('objects-Parking spaces');
  await expect(spaces).toBeVisible();
  const row = spaces.locator('.obj-row').first();
  await expect(row).toContainText('Row');

  // Clicking the row selects the whole row on the canvas.
  await row.click();
  await expect(page.getByTestId('selected-name')).toContainText('Row');
  await expect(row).toHaveClass(/selected/);

  // Open the row and pick one space.
  await row.locator('.twisty').click();
  await spaces.locator('.obj-row.child').nth(1).click();
  await expect(page.getByTestId('selected-name')).toContainText('Space');

  // Canvas selection highlights the matching row and opens its layer.
  await page.getByTestId('layer-Landmarks').click();
  const marks = page.getByTestId('objects-Landmarks');
  await expect(marks.locator('.obj-row')).toHaveCount(1);
  await clickCanvas(page, 30, 30);
  await expect(marks.locator('.obj-row.selected')).toHaveCount(0);
  await marks.locator('.obj-row').first().click();
  await expect(marks.locator('.obj-row.selected')).toHaveCount(1);

  // Hide and lock from the list.
  const stairs = marks.locator('.obj-row').first();
  await stairs.hover();
  await stairs.getByTitle('Lock').click();
  await expect(stairs.getByTitle('Unlock')).toBeVisible();
  await expect(page.getByTestId('properties')).toHaveCount(0);
  await stairs.click();
  await expect(page.getByText(/locked/).first()).toBeVisible();
  await stairs.getByTitle('Unlock').click();
  await stairs.getByTitle('Hide').click();
  await expect(stairs).toHaveClass(/is-hidden/);
  await stairs.getByTitle('Show').click();

  // Rename.
  await stairs.locator('.obj-name').dblclick();
  await page.locator('.obj-name-input').fill('North stairs');
  await page.keyboard.press('Enter');
  await expect(marks.locator('.obj-row').first()).toContainText('North stairs');

  // Drag to another layer.
  await page.getByTestId('expand-Parking spaces').click();
  await marks.locator('.obj-row').first().dragTo(page.getByTestId('layer-Structure'));
  await expect(page.getByTestId('objects-Structure')).toContainText('North stairs');
  await expect(page.getByTestId('objects-Landmarks')).toContainText('Nothing on this layer');

  // Delete.
  const moved = page.getByTestId('objects-Structure').locator('.obj-row', { hasText: 'North stairs' });
  await moved.hover();
  await moved.getByTitle('Delete').click();
  await expect(page.getByTestId('objects-Structure')).not.toContainText('North stairs');
});
