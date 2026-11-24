import { expect, test } from '@playwright/test';

/**
 * bergeronmaps.com (site/), served from the dev server at /site/. Guards the things a site audit
 * found broken: the hero phone vanished when the contact form's spam trap reused its class name.
 */

test('the hero phone is on screen, searchable, and the spam trap stays hidden', async ({ page }) => {
  await page.goto('/site/index.html');
  const phone = page.locator('#hp');
  await expect(phone).toBeVisible();
  const box = await phone.boundingBox();
  expect(box && box.x).toBeGreaterThan(0);
  expect(box && box.width).toBeGreaterThan(150);
  await page.fill('#hp-q', '1D1');
  await expect(page.locator('#hp-res button').first()).toContainText('1D1');
  const trap = await page.locator('.hp-trap').boundingBox();
  expect(trap && trap.x).toBeLessThan(-1000);
});

test('the contact form sends one request with the visitor details', async ({ page }) => {
  let body = '';
  await page.route('**/api/contact', (r) => {
    body = r.request().postData() || '';
    return r.fulfill({ status: 200, contentType: 'application/json', body: '{"success":"true"}' });
  });
  await page.goto('/site/index.html?industry=valet#contact');
  await expect(page.locator('#f-industry')).toHaveValue('valet');
  await page.click('#form-send');
  await expect(page.locator('#form-error')).toHaveText('Please add your name.');
  await page.fill('[name=name]', 'Test Person');
  await page.fill('[name=email]', 'test@example.com');
  await page.click('#form-send');
  await expect(page.locator('#form-done')).toBeVisible();
  expect(JSON.parse(body)).toMatchObject({ Name: 'Test Person', 'Work email': 'test@example.com', Industry: 'Valet' });
});

test('a failed send says so and offers the email address', async ({ page }) => {
  await page.route('**/api/contact', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"success":"false"}' }));
  await page.goto('/site/index.html#contact');
  await page.fill('[name=name]', 'Test Person');
  await page.fill('[name=email]', 'test@example.com');
  await page.click('#form-send');
  await expect(page.locator('#form-error')).toContainText("didn't go through");
  await expect(page.locator('#form-done')).toBeHidden();
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

test('the contact form thank-you takes focus as a named region, read once', async ({ page }) => {
  await page.route('**/api/contact', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"success":"true"}' }));
  await page.goto('/site/index.html#contact');
  await page.waitForTimeout(3100);
  await page.fill('#contact-form [name=name]', 'Pat');
  await page.fill('#contact-form [name=email]', 'pat@example.com');
  await page.click('#form-send');
  const done = page.getByRole('region', { name: 'Request sent' });
  await expect(done).toBeFocused();
  await expect(done).not.toHaveAttribute('role', 'status');
  await expect(done).toHaveAccessibleDescription(/Thanks, we have your details/);
});
