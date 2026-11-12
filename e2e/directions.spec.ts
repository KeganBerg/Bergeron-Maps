import { expect, test } from '@playwright/test';
import { findSpace, routeLines, seedGarage } from './directions-shared';

test('directions from the entrance to a space two floors up, step by step', async ({ page }) => {
  const { id } = await seedGarage(page);
  await page.goto(`/#/view/${id}`);
  await findSpace(page, '3C9');
  await page.getByTestId('directions').click();
  await expect(page.getByTestId('directions-sheet')).toContainText('Where are you starting from?');
  // Ways in are offered first.
  await expect(page.getByTestId('dir-start').first()).toContainText('Entrance');
  await page.getByTestId('dir-start').filter({ hasText: 'Entrance' }).first().click();

  const steps = page.getByTestId('route-step');
  await expect(steps).toHaveCount(3);
  await expect(steps.nth(0)).toContainText(/Walk to (Elevator|Stairway) 1/);
  await expect(steps.nth(1)).toContainText(/Take (Elevator|Stairway) 1 up to Floor 3/);
  await expect(steps.nth(2)).toContainText('Walk to Space 3C9');
  await expect(page.getByTestId('dir-summary')).toContainText(/\d+ ft · about \d+ min · from Entrance/);
  // It opens on the floor you start on, with the line drawn, and every floor on the way is marked.
  await expect(page.getByTestId('viewer-floor-Floor 1')).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => routeLines(page)).toBe(1);
  await expect(page.getByTestId('viewer-floor-Floor 3')).toHaveClass(/on-route/);
  await expect(page.getByTestId('viewer-floor-Floor 2')).not.toHaveClass(/on-route/);

  // Tapping the last step shows the destination floor; the route stays up.
  await steps.nth(2).click();
  await expect(page.getByTestId('viewer-floor-Floor 3')).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => routeLines(page)).toBe(1);
  await page.getByTestId('viewer-floor-Floor 2').click();
  await expect.poll(() => routeLines(page)).toBe(0);
  await expect(page.getByTestId('directions-sheet')).toBeVisible();

  // Step-free: elevator only.
  await page.getByTestId('dir-avoid-stairs').check();
  await expect(steps.nth(1)).toContainText('Take Elevator 1 up to Floor 3');

  // Closing returns to the space's card.
  await page.getByTestId('dir-close').click();
  await expect(page.getByTestId('directions-sheet')).toHaveCount(0);
  await expect(page.getByTestId('info-card')).toContainText('Space 3C9');
  await expect.poll(() => routeLines(page)).toBe(0);
});

test('start by tapping the map: a spot in the aisle, with a real mouse click', async ({ page }) => {
  const { id } = await seedGarage(page);
  await page.goto(`/#/view/${id}`);
  await findSpace(page, '1A3');
  await page.getByTestId('directions').click();
  await page.getByTestId('dir-tap').click();
  await expect(page.getByTestId('dir-tap-banner')).toContainText('Tap where you are now');
  // Click the drive lane under row A on screen.
  const pt = await page.evaluate(async () => {
    type N = { findOne: (s: string) => { text: () => string } | undefined; getClientRect: () => { x: number; y: number; width: number; height: number } };
    const st = (window as unknown as { Konva: { stages: { find: (s: string) => N[]; container: () => HTMLElement }[] } }).Konva.stages[0];
    const g = st.find('.obj').find((n) => n.findOne('Text')?.text() === '1A12')!;
    const r = g.getClientRect();
    const b = st.container().getBoundingClientRect();
    return { x: b.left + r.x + r.width / 2, y: b.top + r.y + r.height * 1.6 };
  });
  await page.mouse.click(pt.x, pt.y);
  await expect(page.getByTestId('dir-summary')).toContainText('from the spot you picked');
  await expect(page.getByTestId('route-step')).toHaveCount(1);
  await expect(page.getByTestId('route-step')).toContainText('Walk to Space 1A3');
  await expect.poll(() => routeLines(page)).toBe(1);
  // Change start goes back to the list.
  await page.getByTestId('dir-change-start').click();
  await expect(page.getByTestId('dir-tap')).toBeVisible();
});

test('a "you are here" link starts directions from that spot', async ({ page }) => {
  const { id, entrance } = await seedGarage(page);
  await page.goto(`/#/view/${id}?from=${entrance}`);
  await findSpace(page, '2B4');
  await page.getByTestId('directions').click();
  await expect(page.getByTestId('dir-summary')).toContainText('from Entrance');
  await expect(page.getByTestId('route-step').last()).toContainText('Walk to Space 2B4');
});
