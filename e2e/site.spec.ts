import { expect, test } from '@playwright/test';

/**
 * bergeronmaps.com (site/), served from the dev server at /site/. Guards the things a site audit
 * found broken: the hero phone vanished when a spam trap reused its class name.
 */

test('the hero phone is on screen and searchable', async ({ page }) => {
  await page.goto('/site/index.html');
  const phone = page.locator('#hp');
  await expect(phone).toBeVisible();
  const box = await phone.boundingBox();
  expect(box && box.x).toBeGreaterThan(0);
  expect(box && box.width).toBeGreaterThan(150);
  await page.fill('#hp-q', '1D1');
  await expect(page.locator('#hp-res button').first()).toContainText('1D1');
});

test('every Get your map now button opens the purchase page', async ({ page }) => {
  await page.goto('/site/index.html');
  const links = page.getByRole('link', { name: 'Get your map now' });
  expect(await links.count()).toBeGreaterThan(3);
  for (const href of await links.evaluateAll((els) => els.map((e) => e.getAttribute('href')))) expect(href).toBe('get-your-map/');
  await expect(page.getByRole('link', { name: 'Request a quote' })).toHaveAttribute('href', 'get-your-map/?quote=1');
});

test('Request a quote emails the quote through our server, with the spam trap hidden', async ({ page }) => {
  let body = '';
  await page.route('**/api/quote', (r) => {
    body = r.request().postData() || '';
    return r.fulfill({ status: 200, contentType: 'application/json', body: '{"success":true}' });
  });
  // The purchase page loads its files from the site root (/get-your-map/), which the dev server keeps under /site/.
  await page.route(/\/get-your-map\/page\.(js|css)$/, (r) => r.fulfill({ path: `site${new URL(r.request().url()).pathname}` }));
  await page.goto('/site/get-your-map/index.html?n=3&term=6&site=school&quote=1');
  await expect(page.locator('#q-em')).toBeFocused();
  const trap = await page.locator('.hp-trap').boundingBox();
  expect(trap && trap.x).toBeLessThan(-1000);
  await page.fill('#q-em', 'pat@example.com');
  await page.click('#q-send');
  await expect(page.locator('#q-done-title')).toHaveText('Quote sent');
  expect(JSON.parse(body)).toMatchObject({ email: 'pat@example.com', locations: 3, term: 6, site: 'school', _honey: '' });
});

test('the self-running demos stay quiet for screen readers; what a visitor finds is read out', async ({ page }) => {
  await page.goto('/site/index.html');
  // The phone searches on its own: nothing is announced while it does.
  await expect(page.locator('#hp-q')).not.toHaveValue('', { timeout: 8000 });
  await expect(page.locator('#hp-info')).not.toHaveAttribute('aria-live');
  await expect(page.locator('#hp-live')).toHaveText('');
  await page.fill('#hp-q', 'EV');
  await page.press('#hp-q', 'Enter');
  await expect(page.locator('#hp-live')).toHaveText(/^EV charger 1, Floor 1/);
  await expect(page.locator('#dm-live')).toHaveText('');
});
