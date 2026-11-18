import { expect, test } from '@playwright/test';
import { seedGarage } from './directions-shared';
import { newMap } from './helpers';

/** Keyboard and screen reader checks: what a person who can't use a mouse, or can't see the map, relies on. */

test('viewer: search, results, directions and closing all work from the keyboard, and are read out', async ({ page }) => {
  const { id } = await seedGarage(page, 'Keyboard Garage');
  await page.goto(`/#/view/${id}`);
  const announce = page.getByTestId('viewer-announce');
  await expect(page.getByRole('heading', { level: 1, name: 'Keyboard Garage' })).toBeVisible();
  await expect(page.getByRole('img', { name: /^Map of / })).toBeAttached();

  const search = page.getByTestId('viewer-search');
  await search.fill('1');
  await expect(announce).toHaveText(/\d+ results?/);
  // Down arrow moves into the results; Escape goes back to the box.
  await search.press('ArrowDown');
  await expect(page.locator('.results button').first()).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(search).toBeFocused();
  await expect(page.getByTestId('search-results')).toHaveCount(0);

  // Picking a result moves focus to the card that describes it, and reads it out.
  await search.fill('');
  await search.fill('1');
  await search.press('ArrowDown');
  await page.keyboard.press('Enter');
  const card = page.getByTestId('info-card');
  await expect(card).toBeFocused();
  await expect(announce).toHaveText(/Space/);

  // Directions: focus goes into the panel, then to the route, then back to the Directions button on close.
  await page.keyboard.press('Tab');
  while (!(await page.getByTestId('directions').evaluate((el) => el === document.activeElement))) await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('directions-sheet')).toBeFocused();
  await expect(announce).toHaveText(/Where are you starting from/);
  await page.getByTestId('dir-start').first().focus();
  await page.keyboard.press('Enter');
  await expect(announce).toHaveText(/feet, about \d+ minutes/);
  await expect(page.getByTestId('directions-sheet')).toBeFocused();
  await page.getByTestId('dir-close').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('directions')).toBeFocused();
});

test('active floor buttons keep readable text on every floor color', async ({ page }) => {
  const { id } = await seedGarage(page, 'Contrast Garage');
  for (const theme of ['classic', 'night', 'signage']) {
    await page.goto(`/?theme=${theme}#/view/${id}`);
    const floors = page.getByRole('navigation', { name: 'Floors' }).getByRole('button');
    await expect(floors).toHaveCount(3);
    for (let i = 0; i < 3; i++) {
      const btn = floors.nth(i);
      const name = await btn.innerText();
      await btn.click();
      await expect(btn).toHaveAttribute('aria-pressed', 'true');
      const ratio = await btn.evaluate((el) => {
        const rgb = (c: string) => c.match(/\d+(\.\d+)?/g)!.slice(0, 3).map(Number);
        const lum = (c: number[]) => {
          const [r, g, b] = c.map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
          return 0.2126 * r + 0.7152 * g + 0.0722 * b;
        };
        const s = getComputedStyle(el);
        const a = lum(rgb(s.color));
        const b = lum(rgb(s.backgroundColor));
        return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      });
      expect(ratio, `${theme} ${name}`).toBeGreaterThanOrEqual(4.5);
    }
  }
});

test('editor: floors switch from the keyboard, and dialogs keep focus inside and give it back', async ({ page }) => {
  await newMap(page, 'Keyboard Lot');
  await page.getByTestId('add-floor').click();
  // Whichever floor isn't showing: reach it with Tab focus and switch with Enter.
  const other = page.locator('.floor-tab-name[aria-pressed="false"]');
  await expect(other).toHaveCount(1);
  const name = await other.innerText();
  const tab = page.getByRole('button', { name, exact: true });
  await tab.focus();
  await page.keyboard.press('Enter');
  await expect(tab).toHaveAttribute('aria-pressed', 'true');

  // The options menu opens on the keyboard, takes focus, and Escape returns it.
  const options = page.getByRole('button', { name: `Options for ${name}` });
  await options.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('menuitem', { name: 'Rename' })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('menuitem', { name: 'Duplicate floor' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
  await expect(options).toBeFocused();

  // A dialog: Tab cycles inside it, Escape closes it, focus goes back to what opened it.
  const addRow = page.getByTestId('add-row');
  await addRow.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press('Tab');
    expect(await dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(addRow).toBeFocused();
});

test('viewer: the floor list shows every row and place as text, and picking one shows it on the map', async ({ page }) => {
  const { id } = await seedGarage(page, 'List Garage');
  await page.goto(`/#/view/${id}`);
  const toggle = page.getByTestId('list-toggle');
  await toggle.focus();
  await page.keyboard.press('Enter');
  const list = page.getByTestId('floor-list');
  await expect(list).toBeFocused();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(list.getByRole('heading', { name: 'Places' })).toBeVisible();
  await expect(list.getByRole('heading', { name: /^Row: spaces / })).toHaveCount(4);
  const first = list.getByRole('heading', { name: /^Row: spaces / }).first();
  await expect(first).toBeVisible();
  const item = list.getByTestId('list-item').filter({ hasText: /^Space / }).first();
  const name = (await item.locator('span').first().innerText()).trim();
  await item.focus();
  await page.keyboard.press('Enter');
  await expect(list).toHaveCount(0);
  await expect(page.getByTestId('info-card')).toContainText(name);
  await expect(page.getByTestId('info-card')).toBeFocused();
  // Escape closes the list and puts focus back on its button.
  await toggle.click();
  await expect(page.getByTestId('floor-list')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('floor-list')).toHaveCount(0);
  await expect(toggle).toBeFocused();
});

test('editor: the Layers list can be walked and used to select from the keyboard', async ({ page }) => {
  const { id } = await seedGarage(page, 'Layers Garage');
  await page.goto(`/#/edit/${id}`);
  await page.getByTestId('tab-layers').click();
  const expand = page.getByRole('button', { name: 'Expand layer' }).last();
  await expand.focus();
  await page.keyboard.press('Enter');
  const rows = page.locator('.obj-row');
  await expect(rows.first()).toBeVisible();
  await rows.first().focus();
  await page.keyboard.press('ArrowDown');
  await expect(rows.nth(1)).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(rows.nth(1)).toHaveAttribute('aria-selected', 'true');
});
