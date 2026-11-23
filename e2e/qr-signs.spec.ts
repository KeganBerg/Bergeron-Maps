import { expect, test, type Page } from '@playwright/test';
import jsQR from 'jsqr';
import { seedGarage } from './directions-shared';
import { editorState, realClick, toScreen } from './real-input';

/**
 * Printed "You are here" signs, checked the way a person would: make the sign, read its
 * QR code off the printed page with a real decoder, open what it says, and land on the
 * sign's floor with "You are here" on the spot. Plus the viewer's own Print.
 */

/** Reads the QR code in a screenshot (PNG) back to its text, with the page doing the PNG decoding. */
async function readQr(page: Page, png: Buffer): Promise<string | null> {
  const { w, h, data } = await page.evaluate(async (b64) => {
    const bmp = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
    const cv = new OffscreenCanvas(bmp.width, bmp.height);
    const ctx = cv.getContext('2d')!;
    ctx.drawImage(bmp, 0, 0);
    return { w: bmp.width, h: bmp.height, data: Array.from(ctx.getImageData(0, 0, bmp.width, bmp.height).data) };
  }, png.toString('base64'));
  return jsQR(new Uint8ClampedArray(data), w, h)?.data ?? null;
}

const hereMarkers = (page: Page) =>
  page.evaluate(() => (window as unknown as { Konva: { stages: { find: (s: string) => unknown[] }[] } }).Konva.stages[0].find('.here-marker').length);

async function openSignFor(page: Page, mapId: string, floor: string, name: string) {
  await page.goto(`/#/edit/${mapId}`);
  await page.getByTestId(`floor-tab-${floor}`).click();
  const o = (await editorState(page)).objects.find((x) => x.name === name)!;
  await realClick(page, await toScreen(page, o, { x: 0, y: 0 }));
  await expect(page.getByTestId('selected-name')).toHaveText(name);
  await page.getByTestId('qr-sign').click();
  await expect(page.getByTestId('sign-link')).toHaveValue(/\?from=/);
  return o;
}

test('a printed sign scans to its floor and spot, at every size', async ({ page }) => {
  const { id } = await seedGarage(page, 'Sign Garage');
  const el = await openSignFor(page, id, 'Floor 2', 'Elevator 1');
  await expect(page.getByTestId('sign-warning')).toHaveCount(0);
  for (const size of ['card', 'letter', 'poster'] as const) {
    await page.getByTestId(`sign-size-${size}`).check();
    const [sign] = await Promise.all([page.waitForEvent('popup'), page.getByTestId('sign-print').click()]);
    await sign.evaluate(() => (window.print = () => undefined));
    await expect(sign.getByTestId('sign')).toContainText('Elevator 1 · Floor 2');
    // On the page at the size it prints at (96 CSS px to the inch).
    const qr = (await sign.getByTestId('sign-qr').boundingBox())!;
    expect(qr.width / 96).toBeCloseTo({ card: 2.5, letter: 4, poster: 6.5 }[size], 1);
    await expect(sign.getByTestId('sign-map')).toHaveCount(size === 'card' ? 0 : 1);
    // It fits on one page.
    const pdf = await sign.pdf({ preferCSSPageSize: true, printBackground: true });
    expect(pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g)).toHaveLength(1);
    const text = await readQr(page, await sign.getByTestId('sign-qr').screenshot());
    expect(text).toBe(await page.getByTestId('sign-link').inputValue());
    await sign.close();
  }
  // Scanning it: the viewer opens on Floor 2 with "You are here" on the elevator.
  const url = await page.getByTestId('sign-link').inputValue();
  expect(url).toContain(`?from=${el.id}`);
  await page.goto(url);
  await expect(page.locator('.viewer-header .titles')).toContainText('Floor 2');
  await expect(page.getByTestId('info-card')).toContainText('Elevator 1');
  await expect(page.getByTestId('info-card')).toContainText('You are here');
  expect(await hereMarkers(page)).toBe(1);
});

test('the sign says when the map has to be published first', async ({ page }) => {
  const { id } = await seedGarage(page, 'Unpublished Garage');
  await page.evaluate(async (mapId) => {
    const { repository } = await import('/src/storage/indexedDbRepository.ts');
    await repository.unpublishMap(mapId);
  }, id);
  await openSignFor(page, id, 'Floor 1', 'Entrance');
  await expect(page.getByTestId('sign-warning')).toContainText('isn’t published yet');
  // A card leaves the map off; the box says so.
  await page.getByTestId('sign-size-card').check();
  await expect(page.getByTestId('sign-with-map')).toBeDisabled();
});

test('printing the viewer prints the whole floor, not the screen', async ({ page }) => {
  const { id } = await seedGarage(page, 'Print Garage');
  await page.goto(`/#/view/${id}`);
  await expect(page.getByTestId('viewer-facility')).toBeVisible();
  // Zoomed in on a corner first: the printout still has the whole floor.
  await page.getByTestId('viewer-floor-Floor 3').click();
  await page.mouse.move(300, 300);
  for (let i = 0; i < 5; i++) await page.mouse.wheel(0, -300);
  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  await page.emulateMedia({ media: 'print' });
  const pic = page.getByTestId('print-map');
  await expect(pic).toBeVisible();
  await expect(page.locator('.viewer-print h1')).toHaveText('Print Garage · Floor 3');
  await expect(page.locator('.viewer-header')).toBeHidden();
  await expect(page.getByTestId('reset-view')).toBeHidden();
  const size = await pic.evaluate((c: HTMLCanvasElement) => ({ w: c.width, h: c.height }));
  expect(Math.max(size.w, size.h)).toBeGreaterThanOrEqual(2000);
  const box = (await pic.boundingBox())!;
  expect(box.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
  await page.emulateMedia({ media: 'screen' });
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  await expect(pic).toHaveCount(0);
});
