import { expect, test, type Page, type Route } from '@playwright/test';
import { createMap } from '../../src/model/factory';
import { COMPANY, MockSupabase, SITE_A, USERS, type User } from './mock-supabase';

/**
 * Saving under stress (2026-11-19 audit), in a real browser against the online
 * app: two managers on one map, a dropped connection, going offline, and a tab
 * that crashes while a save is still on its way.
 */

const status = (page: Page) => page.getByTestId('save-status');

async function rename(page: Page, name: string) {
  const field = page.getByTestId('map-name-input-top');
  await field.fill(name);
  await field.press('Enter');
  // Leave the field, as a person moving on to the map would.
  await field.blur();
}

/**
 * Cuts this page off: the browser reports being offline (as a phone in a car
 * park does) and every request to the server fails.
 */
async function offlineSwitch(page: Page) {
  let off = false;
  await page.route('https://mock.supabase.co/**', (route) => (off ? route.abort('internetdisconnected') : route.fallback()));
  return async (on: boolean) => {
    off = on;
    await page.context().setOffline(on);
  };
}

/**
 * What a crash leaves behind: the page gets no chance to write anything on the
 * way out, so only copies made while it was running survive. Then the tab goes.
 */
async function crash(page: Page) {
  await page.evaluate(() => {
    Storage.prototype.setItem = () => undefined;
    Storage.prototype.removeItem = () => undefined;
    IDBObjectStore.prototype.put = () => { throw new Error('crashed'); };
    IDBObjectStore.prototype.delete = () => { throw new Error('crashed'); };
  });
  await page.close();
}

/** One shared stand-in server; each person gets their own browser (context) talking to it. */
function server(page: Page) {
  const sb = new MockSupabase(page);
  const doc = createMap('Level 1 garage');
  sb.maps.push({ id: doc.id, company_id: COMPANY.id, facility_id: SITE_A.id, name: doc.name, draft: doc as unknown as Record<string, unknown>, revision: 1, slot: 1 });
  return { sb, doc };
}
async function join(page: Page, from: MockSupabase, as: User) {
  const sb = new MockSupabase(page);
  sb.maps = from.maps;
  sb.versions = from.versions;
  sb.published = from.published;
  await sb.install(as);
  return sb;
}

test('two managers on one map: the idle one sees the other’s save; when both edit, nothing is overwritten unseen', async ({ browser }) => {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  const { sb, doc } = server(a);
  await sb.install(USERS.owner);
  await join(b, sb, USERS.siteManager);
  await a.goto(`/#/edit/${doc.id}`);
  await b.goto(`/#/edit/${doc.id}`);
  await expect(status(a)).toHaveText(/Saved/);
  await expect(status(b)).toHaveText(/Saved/);

  // The owner renames the map; the manager, who hasn't touched anything, comes back to their window.
  await rename(a, 'Level 1 garage (owner)');
  await expect(status(a)).toHaveText(/Saved/);
  await b.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(b.getByTestId('map-name-input-top')).toHaveValue('Level 1 garage (owner)');
  await expect(b.getByTestId('notice').first()).toContainText('saved in another window or by another manager');
  await expect(status(b)).toHaveText(/Saved/);

  // The owner saves again, and the manager changes something before their window has looked:
  // the manager gets the choice, and the owner's version is kept either way.
  await rename(a, 'Owner’s second name');
  await expect(status(a)).toHaveText(/Saved/);
  await rename(b, 'Manager’s name');
  await expect(status(b)).toHaveText(/Changed elsewhere/);
  await expect(b.getByRole('dialog')).toContainText('This map was changed somewhere else');
  await b.getByTestId('conflict-mine').click();
  await expect(status(b)).toHaveText(/Saved/);
  expect(sb.maps[0].name).toBe('Manager’s name');
  const kept = sb.versions.find((v) => v.reason === 'conflict');
  expect((kept?.doc as { name?: string } | undefined)?.name).toBe('Owner’s second name');

  // The owner's window, idle again, catches up instead of later overwriting the manager.
  await a.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(a.getByTestId('map-name-input-top')).toHaveValue('Manager’s name');
  await ctxA.close();
  await ctxB.close();
});

test('a save whose answer is lost on a dropped connection is not reported as someone else’s change', async ({ page }) => {
  const { sb, doc } = server(page);
  await sb.install(USERS.siteManager);
  await page.goto(`/#/edit/${doc.id}`);
  await expect(status(page)).toHaveText(/Saved/);

  // The next save reaches the server, which stores it, but the answer never comes back.
  let dropped = 0;
  await page.route(/\/rest\/v1\/maps\?.*revision=/, async (route: Route) => {
    if (route.request().method() !== 'PATCH' || dropped++) return route.fallback();
    const body = route.request().postDataJSON() as { name: string; draft: Record<string, unknown> };
    Object.assign(sb.maps[0], body, { revision: sb.maps[0].revision + 1 });
    await route.abort('connectionreset');
  });
  await rename(page, 'Saved, but the answer was lost');
  await expect(status(page)).toContainText('Save failed');
  // The retry finds our own save already there.
  await expect(status(page)).toHaveText(/Saved/, { timeout: 12_000 });
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(sb.maps[0].name).toBe('Saved, but the answer was lost');
});

test('offline: the editor says so, keeps working, and saves the moment the connection is back', async ({ page }) => {
  const { sb, doc } = server(page);
  await sb.install(USERS.siteManager);
  const setOffline = await offlineSwitch(page);
  await page.goto(`/#/edit/${doc.id}`);
  await expect(status(page)).toHaveText(/Saved/);

  await setOffline(true);
  await rename(page, 'Edited on the train');
  await expect(status(page)).toHaveText(/Offline/);
  await rename(page, 'Edited on the train, twice');
  await expect.poll(() => page.evaluate((id) => JSON.parse(localStorage.getItem(`bm.unsaved.${id}`) ?? 'null')?.doc?.name, doc.id)).toBe(
    'Edited on the train, twice',
  );
  await setOffline(false);
  // Well before the next scheduled retry.
  await expect(status(page)).toHaveText(/Saved/, { timeout: 4000 });
  expect(sb.maps[0].name).toBe('Edited on the train, twice');
  await expect.poll(() => page.evaluate((id) => localStorage.getItem(`bm.unsaved.${id}`), doc.id)).toBeNull();
});

test('a tab that crashes while a save is still on its way loses nothing: reopening offers the changes back', async ({ page, context }) => {
  const { sb, doc } = server(page);
  await sb.install(USERS.siteManager);
  await page.goto(`/#/edit/${doc.id}`);
  await expect(status(page)).toHaveText(/Saved/);

  // A very slow connection: saves never finish.
  await page.route(/\/rest\/v1\/maps\?.*revision=/, (route) => (route.request().method() === 'PATCH' ? undefined : route.fallback()));
  await rename(page, 'Changed just before the crash');
  await expect(status(page)).toHaveText(/Saving/);
  // Long enough for the slow-save copy (1.5 s), then the tab crashes.
  await page.waitForTimeout(2200);
  await crash(page);

  const again = await context.newPage();
  await join(again, sb, USERS.siteManager);
  await again.goto(`/#/edit/${doc.id}`);
  await expect(again.getByRole('dialog')).toContainText('Recover unsaved changes?');
  await again.getByTestId('recover-changes').click();
  await expect(again.getByTestId('map-name-input-top')).toHaveValue('Changed just before the crash');
  await expect(status(again)).toHaveText(/Saved/);
  expect(sb.maps[0].name).toBe('Changed just before the crash');
  expect(sb.versions.some((v) => v.label === 'Before recovering unsaved changes')).toBe(true);
});

test('a map too big for the browser’s small storage (a photo background) is still kept when offline and recovered after a crash', async ({ page, context }) => {
  const { sb, doc } = server(page);
  // About 6 MB of picture: more than localStorage holds.
  const big = `data:image/png;base64,${'A'.repeat(6_000_000)}`;
  (sb.maps[0].draft as Record<string, unknown>).background = { src: big, x: 0, y: 0, width: 1000, height: 800, opacity: 0.5, locked: true };
  await sb.install(USERS.siteManager);
  const setOffline = await offlineSwitch(page);
  await page.goto(`/#/edit/${doc.id}`);
  await expect(status(page)).toHaveText(/Saved/);

  await setOffline(true);
  await rename(page, 'Big map, offline edit');
  await expect(status(page)).toHaveText(/Offline/);
  // Too big for localStorage: the copy went to IndexedDB.
  await expect.poll(() => page.evaluate((id) => localStorage.getItem(`bm.unsaved.${id}`), doc.id)).toBeNull();
  await page.waitForTimeout(500);
  await crash(page);
  await setOffline(false);

  const again = await context.newPage();
  await join(again, sb, USERS.siteManager);
  await again.goto(`/#/edit/${doc.id}`);
  await expect(again.getByRole('dialog')).toContainText('Recover unsaved changes?', { timeout: 15_000 });
  await again.getByTestId('recover-changes').click();
  await expect(again.getByTestId('map-name-input-top')).toHaveValue('Big map, offline edit');
});

test('“Not now” on recovery keeps the copy in Version history instead of dropping it', async ({ page }) => {
  const { sb, doc } = server(page);
  await sb.install(USERS.siteManager);
  await page.addInitScript(([id, d]) => {
    if (sessionStorage.getItem('bm.seededBackup')) return;
    sessionStorage.setItem('bm.seededBackup', '1');
    localStorage.setItem(`bm.unsaved.${id}`, JSON.stringify({ savedAt: '2026-11-19T10:00:00Z', baseRevision: 1, doc: { ...d, name: 'Left behind' } }));
  }, [doc.id, doc] as const);
  await page.goto(`/#/edit/${doc.id}`);
  await expect(page.getByRole('dialog')).toContainText('Recover unsaved changes?');
  await page.getByTestId('recover-later').click();
  await expect.poll(() => sb.versions.find((v) => /not recovered/.test(v.label))?.label).toMatch(/Unsaved changes from .* \(not recovered\)/);
  await expect.poll(() => page.evaluate((id) => localStorage.getItem(`bm.unsaved.${id}`), doc.id)).toBeNull();
  await expect(page.getByTestId('map-name-input-top')).toHaveValue('Level 1 garage');
});
