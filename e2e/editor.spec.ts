import { expect, test } from '@playwright/test';
import { clickCanvas, drawRow, newMap, waitSaved, addFromLibrary } from './helpers';

test('manager creates a numbered row, copies and pastes it, renumbers and undoes', async ({ page }) => {
  await newMap(page, 'Harbor Hotel');
  await drawRow(page, [100, 200], [1000, 200]);
  await page.getByTestId('row-count').fill('20');
  await page.getByTestId('row-prefix').fill('B');
  await expect(page.getByTestId('row-preview')).toContainText('B1, B2, B3, … B20');
  await page.getByTestId('create-row').click();
  await expect(page.getByTestId('selected-name')).toHaveText('Row B1–B20');

  await page.keyboard.press('Control+c');
  await page.keyboard.press('Control+v');
  await expect(page.getByTestId('notice').first()).toContainText('20 pasted spaces use numbers already on this floor');
  await page.getByTestId('notice-action').first().click();
  await expect(page.getByTestId('selected-name')).toHaveText('Row B21–B40');

  // Pasting again from the same copy works without copying again.
  await page.keyboard.press('Control+v');
  await expect(page.getByTestId('notice').first()).toBeVisible();

  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  await expect(page.getByTestId('selected-name')).toHaveCount(0);
  await page.keyboard.press('Control+Shift+z');
  await waitSaved(page);
  await page.getByRole('button', { name: 'All maps' }).click();
  await expect(page.getByTestId('map-list')).toContainText('40 spaces');
});

test('row settings can be changed after creating the row', async ({ page }) => {
  await newMap(page, 'Event Lot');
  await page.getByTestId('add-row').click();
  await page.getByTestId('row-count').fill('5');
  await page.getByTestId('create-row').click();
  await expect(page.getByTestId('selected-name')).toHaveText('Row 1–5');
  await page.getByTestId('row-edit-count').fill('8');
  await page.getByTestId('row-edit-count').press('Enter');
  await page.getByTestId('row-edit-prefix').fill('A');
  await page.getByTestId('row-edit-prefix').press('Enter');
  await page.getByTestId('row-reverse').check();
  await expect(page.getByTestId('selected-name')).toHaveText('Row A8–A1');
});

test('floors: add, rename, duplicate and switch', async ({ page }) => {
  await newMap(page, 'Garage');
  await page.getByTestId('add-row').click();
  await page.getByTestId('create-row').click();
  await page.getByTestId('add-floor').click();
  await expect(page.getByTestId('floor-tab-Floor 2')).toHaveAttribute('aria-selected', 'true');
  await page.getByTestId('floor-tab-Floor 2').dblclick();
  await page.getByTestId('floor-rename').fill('Rooftop');
  await page.getByTestId('floor-rename').press('Enter');
  await expect(page.getByTestId('floor-tab-Rooftop')).toBeVisible();

  await page.getByTestId('floor-tab-Floor 1').click();
  await page.getByTestId('floor-menu').click();
  await page.getByTestId('floor-duplicate').click();
  await expect(page.getByTestId('floor-tab-Floor 1 (copy)')).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Control+a');
  await expect(page.getByTestId('selected-name')).toHaveText('Row 1–10');

  await page.getByTestId('floor-menu').click();
  await page.getByTestId('floor-delete').click();
  await page.getByRole('button', { name: 'Delete floor' }).click();
  await expect(page.getByTestId('floor-tab-Floor 1 (copy)')).toHaveCount(0);
});

test('locked layers cannot be selected; layers can be added and objects moved between them', async ({ page }) => {
  await newMap(page, 'Layers');
  await addFromLibrary(page, 'column');
  await expect(page.getByTestId('selected-name')).toHaveText('Column 1');
  await page.getByTestId('tab-layers').click();
  await page.getByTestId('lock-Structure').click();
  await expect(page.getByTestId('selected-name')).toHaveCount(0);
  await page.keyboard.press('Control+a');
  await expect(page.getByTestId('properties')).toHaveCount(0);
  await page.getByTestId('lock-Structure').click();
  await page.keyboard.press('Control+a');
  await page.getByTestId('object-layer').selectOption({ label: 'Landmarks' });
  await expect(page.getByTestId('layer-Landmarks')).toContainText('1');
  await page.getByTestId('add-layer').click();
  await expect(page.getByTestId('layer-Layer 5')).toBeVisible();
});

test('work is saved automatically and survives a reload; deleted maps can be restored', async ({ page }) => {
  await newMap(page, 'Reload Test');
  await addFromLibrary(page, 'valet-booth');
  await waitSaved(page);
  await page.reload();
  await expect(page.getByTestId('canvas').locator('canvas').first()).toBeVisible();
  await page.keyboard.press('Control+a');
  await expect(page.getByTestId('selected-name')).toHaveText('Valet booth 1');

  await page.getByRole('button', { name: 'All maps' }).click();
  await page.getByTestId('delete-Reload Test').click();
  await page.getByRole('button', { name: 'Move to Recently deleted' }).click();
  await expect(page.getByTestId('trash-list')).toContainText('Reload Test');
  await page.getByTestId('restore-Reload Test').click();
  await expect(page.getByTestId('map-list')).toContainText('Reload Test');
});

test('version history restores an earlier version without losing the newer one', async ({ page }) => {
  await newMap(page, 'Versions');
  await addFromLibrary(page, 'tree');
  await page.getByTestId('save').click();
  await waitSaved(page);
  await addFromLibrary(page, 'tree');
  await addFromLibrary(page, 'tree');
  await waitSaved(page);
  await page.getByTestId('history').click();
  const items = page.getByTestId('version-list').locator('li');
  await items.last().getByRole('button', { name: 'Restore…' }).click();
  await page.getByTestId('confirm-restore').click();
  await expect(page.getByTestId('notice').first()).toContainText('Restored the version');
  await page.keyboard.press('Control+a');
  await expect(page.getByTestId('selected-name')).toHaveText('Tree 1');
  await page.getByTestId('history').click();
  await expect(page.getByTestId('version-list')).toContainText('Before restoring an older version');
});

test('conflicting edits from two windows are detected and both versions are kept', async ({ page, context }) => {
  await newMap(page, 'Shared');
  await waitSaved(page);
  const url = page.url();
  const other = await context.newPage();
  await other.goto(url);
  await expect(other.getByTestId('canvas').locator('canvas').first()).toBeVisible();

  await addFromLibrary(page, 'tree');
  await waitSaved(page);
  await addFromLibrary(other, 'column');
  await expect(other.getByTestId('save-status')).toContainText('Changed elsewhere');
  await expect(other.getByRole('dialog')).toContainText('This map was changed somewhere else');
  await other.getByTestId('conflict-mine').click();
  await expect(other.getByTestId('save-status')).toContainText('Saved');
  await other.getByTestId('history').click();
  await expect(other.getByTestId('version-list')).toContainText('Other changes (replaced by yours)');
});

test('text labels and smart snapping modes are available', async ({ page }) => {
  await newMap(page, 'Labels');
  await page.getByTestId('tool-text').click();
  await clickCanvas(page, 300, 300);
  await page.getByTestId('text-value').fill('Section A');
  await page.getByTestId('text-value').press('Enter');
  await expect(page.getByTestId('selected-name')).toHaveText('Section A');
  await page.getByTestId('snap-mode').selectOption('free');
  await page.getByTestId('snap-mode').selectOption('grid');
  await expect(page.getByLabel('Grid size')).toBeVisible();
});

test('quick lot builder creates a numbered lot in one step', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('new-map').click();
  await page.getByTestId('map-name-input').fill('Quick Lot');
  await page.getByTestId('quick-rows').fill('3');
  await page.getByTestId('quick-spacesPerRow').fill('8');
  await expect(page.getByTestId('create-map')).toHaveText('Create map with 24 spaces');
  await page.getByTestId('create-map').click();
  await expect(page.getByTestId('canvas').locator('canvas').first()).toBeVisible();
  await page.goto('/');
  await expect(page.getByTestId('open-Quick Lot')).toContainText('24 spaces');
});

test('a map can be downloaded as a file and imported again as a new map', async ({ page }) => {
  await newMap(page, 'Riverside Garage');
  await page.getByTestId('add-row').click();
  await page.getByTestId('row-count').fill('6');
  await page.getByTestId('create-row').click();
  await waitSaved(page);
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('download-map').click()]);
  expect(download.suggestedFilename()).toBe('Riverside-Garage.bmap.json');
  const file = await download.path();

  await page.getByRole('button', { name: 'All maps' }).click();
  await page.getByTestId('import-map-input').setInputFiles(file!);
  await expect(page.getByTestId('canvas').locator('canvas').first()).toBeVisible();
  await page.getByRole('button', { name: 'All maps' }).click();
  await expect(page.getByTestId('map-list').locator('li')).toHaveCount(2);
  await expect(page.getByTestId('map-list')).toContainText('6 spaces');

  await page.getByTestId('import-map-input').setInputFiles({ name: 'notes.json', mimeType: 'application/json', buffer: Buffer.from('{"hi":1}') });
  await expect(page.getByText('“notes.json” couldn’t be imported.')).toBeVisible();
});

test('fill opacity, border color and border thickness can be changed, including no border', async ({ page }) => {
  await newMap(page, 'Styles');
  await addFromLibrary(page, 'space-standard');
  await expect(page.getByTestId('style-fields')).toBeVisible();
  await page.getByTestId('style-border-0').click();
  await expect(page.getByTestId('style-stroke-width')).toHaveValue('0');
  await page.getByTestId('style-stroke-width').fill('2.5');
  await page.getByTestId('style-stroke-width').press('Enter');
  await expect(page.getByTestId('style-stroke-width')).toHaveValue('2.5');
  await page.getByTestId('style-opacity').fill('40');
  await expect(page.getByTestId('style-fields')).toContainText('40%');
  await page.getByTestId('style-opacity').blur();
  await page.keyboard.press('Control+z');
  await expect(page.getByTestId('style-fields')).toContainText('100%');
  await page.getByTestId('space-variant').selectOption('ev');
  await expect(page.getByTestId('space-variant')).toHaveValue('ev');
});

test('employees only see a map after it is published, and only the published version', async ({ page }) => {
  await newMap(page, 'Publish Lot');
  const id = page.url().split('/edit/')[1];
  await page.goto(`/#/view/${id}`);
  await expect(page.getByText('isn’t published yet')).toBeVisible();

  await page.goto(`/#/edit/${id}`);
  await expect(page.getByTestId('publish')).toHaveAttribute('data-state', 'never');
  await page.getByTestId('publish').click();
  await expect(page.getByTestId('publish')).toHaveAttribute('data-state', 'current');

  // A later draft change is not visible to employees until published again.
  await page.getByTestId('map-name-input-top').fill('Publish Lot Renamed');
  await page.getByTestId('map-name-input-top').press('Enter');
  await expect(page.getByTestId('publish')).toHaveAttribute('data-state', 'changes');
  await waitSaved(page);
  await page.goto(`/#/view/${id}`);
  await expect(page.getByTestId('viewer-facility')).toHaveText('Publish Lot');
});

test('order buttons put an object above or below objects on other layers', async ({ page }) => {
  await newMap(page, 'Order Test');
  await addFromLibrary(page, 'tree');
  await addFromLibrary(page, 'grass-area');
  await expect(page.getByTestId('selected-name')).toHaveText('Grass area 1');
  await page.getByTestId('order-front').click();
  await expect(page.getByTestId('notice').last()).toContainText('so it shows on top');
  await expect(page.getByTestId('object-layer')).toHaveValue(/.+/);
  await page.getByTestId('order-forward').click();
  await expect(page.getByTestId('notice').last()).toContainText('Already in front');
  await page.getByTestId('order-back').click();
  await page.getByTestId('order-backward').click();
  await expect(page.getByTestId('notice').last()).toContainText('Already at the back');
});

test('custom zone gets a Google symbol, and the symbol can be switched off', async ({ page }) => {
  await newMap(page, 'Symbol Test');
  await addFromLibrary(page, 'custom-zone');
  await expect(page.getByTestId('symbol-field')).toBeVisible();
  await page.getByTestId('symbol-choose').click();
  await page.getByTestId('symbol-search').fill('restroom');
  await page.getByTestId('symbol-wc').click();
  await expect(page.getByTestId('symbol-current')).toContainText('wc');
  await page.getByTestId('symbol-toggle').uncheck();
  await expect(page.getByTestId('symbol-current')).toHaveCount(0);
  await page.getByTestId('symbol-toggle').check();
  await expect(page.getByTestId('symbol-current')).toContainText('wc');
});

test('grass pieces curve, merge and can be cut', async ({ page }) => {
  await newMap(page, 'Shape Test');
  await addFromLibrary(page, 'grass-divider');
  await expect(page.getByTestId('shape-fields')).toBeVisible();
  await page.getByTestId('shape-corner').fill('12');
  await page.getByTestId('shape-corner').press('Enter');
  await expect(page.getByTestId('shape-corner-slider')).toHaveValue('12');
  await expect(page.getByTestId('shape-merge')).toBeChecked();

  // Grid cut across the middle of the divider.
  await page.getByTestId('tool-cut-grid').click();
  const c = (await page.getByTestId('canvas').boundingBox())!;
  const cx = c.x + c.width / 2;
  const cy = c.y + c.height / 2;
  await page.mouse.move(cx - 20, cy - 40);
  await page.mouse.down();
  await page.mouse.move(cx + 20, cy + 40, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByTestId('notice').last()).toContainText('Cut out');
  await page.keyboard.press('Escape');
  await page.mouse.click(cx - 60, cy);
  await expect(page.getByTestId('shape-clear-cuts')).toBeVisible();
  await page.getByTestId('shape-clear-cuts').click();
  await expect(page.getByTestId('shape-clear-cuts')).toHaveCount(0);
});
