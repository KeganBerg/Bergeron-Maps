import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { createMap } from '../../src/model/factory';
import { COMPANY, MockSupabase, OTHER_COMPANY, SITE_A, SITE_B, USERS } from './mock-supabase';

/** All accounts → backups: download, delete, restore from the file. */

const MAP_ID = 'a0000000-0000-4000-8000-0000000000b1';

function withMap(sb: MockSupabase) {
  sb.maps.push({ id: MAP_ID, company_id: COMPANY.id, facility_id: SITE_A.id, name: 'Garage', draft: createMap('Garage') as never, revision: 3, slot: 1 });
  sb.published.set(MAP_ID, { isPublic: true });
  sb.versions.push({ id: 'b0000000-0000-4000-8000-000000000001', map_id: MAP_ID, created_at: '2026-11-10T00:00:00Z', reason: 'manual', label: 'Saved', revision: 2, doc: createMap('Garage') });
}

test('a company is backed up from the delete dialog, deleted, and restored from the file', async ({ page }, info) => {
  const sb = new MockSupabase(page);
  withMap(sb);
  await sb.install(USERS.admin);
  await page.goto('/#/admin');

  await page.getByTestId(`delete-company-${COMPANY.name}`).click();
  await expect(page.getByRole('dialog')).toContainText(`No backup of ${COMPANY.name} downloaded yet`);
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('delete-company-backup').click()]);
  expect(download.suggestedFilename()).toMatch(/^Company-backup-\d{4}-\d{2}-\d{2}\.bmbackup\.json$/);
  const file = info.outputPath('backup.bmbackup.json');
  await download.saveAs(file);
  await expect(page.getByTestId('delete-company-backed-up')).toBeVisible();

  const backup = JSON.parse(readFileSync(file, 'utf8'));
  expect(backup).toMatchObject({ format: 'bergeron-maps/backup', version: 1, exportedBy: USERS.admin.email });
  expect(backup.companies).toHaveLength(1);
  const c = backup.companies[0];
  expect(c).toMatchObject({ id: COMPANY.id, name: COMPANY.name });
  expect(c.sites.map((s: { id: string; slug: string; join_code: string }) => [s.id, s.slug, s.join_code]))
    .toEqual(expect.arrayContaining([[SITE_A.id, SITE_A.slug, SITE_A.code], [SITE_B.id, SITE_B.slug, SITE_B.code]]));
  expect(c.people.map((p: { email: string }) => p.email).sort()).toEqual([USERS.employee.email, USERS.siteManager.email, USERS.owner.email].sort());
  expect(c.maps).toHaveLength(1);
  expect(c.maps[0]).toMatchObject({ id: MAP_ID, name: 'Garage', published: { revision: 3 } });
  expect(c.maps[0].versions).toHaveLength(1);

  await page.getByTestId('delete-company-name').fill(COMPANY.name);
  await page.getByTestId('delete-company-confirm').click();
  await expect(page.getByTestId(`admin-company-${COMPANY.name}`)).toHaveCount(0);

  // Restore: pick the file, see what's in it, bring it back.
  await page.getByTestId('restore-file').setInputFiles(file);
  const dialog = page.getByRole('dialog', { name: 'Restore from backup' });
  await expect(dialog).toContainText('2 sites, 3 people, 1 map, 1 saved version');
  await page.getByTestId('restore-confirm').click();
  await expect(page.getByTestId('restore-result')).toContainText(`${COMPANY.name} is back: 2 sites, 1 map (1 published), 3 people with access, 1 saved version`);
  await page.screenshot({ path: info.outputPath('restore-result.png') });
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByTestId(`admin-company-${COMPANY.name}`)).toContainText(SITE_A.name);
  expect(sb.maps.find((m) => m.id === MAP_ID)?.company_id).toBe(COMPANY.id);
  expect(sb.versions).toHaveLength(1);
  // Versions go separately, so the company itself is sent without them.
  expect((sb.restoredPayloads[0].maps as Record<string, unknown>[])[0]).not.toHaveProperty('versions');
});

test('one file backs up every company; a company that still exists cannot be restored over', async ({ page }, info) => {
  const sb = new MockSupabase(page);
  withMap(sb);
  await sb.install(USERS.admin);
  await page.goto('/#/admin');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('backup-all').click()]);
  expect(download.suggestedFilename()).toMatch(/^All-accounts-backup-/);
  const file = info.outputPath('all.bmbackup.json');
  await download.saveAs(file);
  const backup = JSON.parse(readFileSync(file, 'utf8'));
  expect(backup.companies.map((c: { name: string }) => c.name).sort()).toEqual([COMPANY.name, OTHER_COMPANY.name].sort());
  // Each company carries only its own maps.
  expect(backup.companies.find((c: { id: string }) => c.id === OTHER_COMPANY.id).maps).toEqual([]);

  await page.getByTestId('restore-file').setInputFiles(file);
  await expect(page.getByRole('dialog')).toContainText('Still in All accounts');
  await expect(page.getByTestId(`restore-pick-${COMPANY.name}`)).toBeDisabled();
  await expect(page.getByTestId('restore-confirm')).toBeDisabled();
});

test('a map file or a broken file is refused with a plain message', async ({ page }) => {
  const sb = new MockSupabase(page);
  await sb.install(USERS.admin);
  await page.goto('/#/admin');
  await page.getByTestId('restore-file').setInputFiles({ name: 'Garage.bmap.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ format: 'bergeron-maps/map', map: createMap('x') })) });
  await expect(page.getByRole('alert')).toContainText('single map file');
  await page.getByTestId('restore-file').setInputFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{oops') });
  await expect(page.getByRole('alert')).toContainText('isn’t a Bergeron Maps backup');
});
