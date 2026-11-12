import { expect, test, type Locator } from '@playwright/test';
import { addFromLibrary, newMap } from './helpers';

/** Text color and background of a field must differ enough to read what is typed. */
async function contrast(el: Locator) {
  return el.evaluate((node) => {
    const rgb = (c: string) => (c.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
    const lum = (c: number[]) => {
      const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
      return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
    };
    const cs = getComputedStyle(node);
    const a = lum(rgb(cs.color));
    const b = lum(rgb(cs.backgroundColor));
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  });
}

for (const theme of ['signage', 'classic', 'night']) {
  test(`typing a floor name is readable (${theme})`, async ({ page }) => {
    await page.goto(`/?theme=${theme}`);
    await newMap(page, 'Readable');
    await page.getByTestId('floor-tab-Floor 1').dblclick();
    const input = page.getByTestId('floor-rename');
    await input.fill('Rooftop');
    expect(await contrast(input)).toBeGreaterThan(4.5);
  });
}

test('a selection box released outside the map still selects and goes away', async ({ page }) => {
  await newMap(page, 'Marquee');
  await addFromLibrary(page, 'column');
  await page.keyboard.press('Escape');
  const c = (await page.getByTestId('canvas').boundingBox())!;
  await page.mouse.move(c.x + 20, c.y + 20);
  await page.mouse.down();
  await page.mouse.move(c.x + c.width - 20, c.y + c.height - 20, { steps: 6 });
  // Let go over the floor tabs, below the map.
  await page.mouse.move(c.x + c.width / 2, c.y + c.height + 20, { steps: 3 });
  await page.mouse.up();
  await expect(page.getByTestId('selected-name')).toHaveText('Column 1');
});

test('duplicating a named object gives the copy the next number', async ({ page }) => {
  await newMap(page, 'Names');
  await addFromLibrary(page, 'column');
  await page.getByTestId('asset-search').blur();
  await page.keyboard.press('Control+d');
  await expect(page.getByTestId('selected-name')).toHaveText('Column 2');
  await page.keyboard.press('Control+c');
  await page.keyboard.press('Control+v');
  await expect(page.getByTestId('selected-name')).toHaveText('Column 3');
});
