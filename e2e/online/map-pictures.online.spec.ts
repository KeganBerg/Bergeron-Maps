import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { createMap } from '../../src/model/factory';
import { COMPANY, MockSupabase, SITE_A, USERS } from './mock-supabase';

/**
 * Map pictures live in file storage (2026-11-24): a background image added
 * online is uploaded once and the map keeps only its address; older maps with
 * the picture inside move it out on their next save; map files still carry
 * the picture; and before the storage step is run, nothing changes.
 */

const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR42mP8z8DwnwEJMDIwMDAwAAA8ZwX7wqCyGQAAAABJRU5ErkJggg==';
const PNG = { name: 'site-plan.png', mimeType: 'image/png', buffer: Buffer.from(PNG_B64, 'base64') };
const STORED = new RegExp(`^https://mock\\.supabase\\.co/storage/v1/object/public/map-images/${COMPANY.id}/[0-9a-f]{64}\\.png$`);
const status = (page: Page) => page.getByTestId('save-status');

function server(page: Page, inside?: string) {
  const sb = new MockSupabase(page);
  const doc = createMap('Level 1 garage');
  if (inside) {
    const f = doc.floors[0];
    f.background = { layerId: f.layers[0].id, src: inside, x: 0, y: 0, width: 200, height: 200, opacity: 0.6 };
  }
  sb.maps.push({ id: doc.id, company_id: COMPANY.id, facility_id: SITE_A.id, name: doc.name, draft: doc as unknown as Record<string, unknown>, revision: 1, slot: 1 });
  return { sb, doc };
}
const bgSrc = (sb: MockSupabase) => (sb.maps[0].draft as { floors: { background?: { src: string } }[] }).floors[0].background?.src;

async function addBackground(page: Page) {
  await page.getByTestId('library-bg-file').setInputFiles(PNG);
  await expect(page.getByTestId('notice').first()).toContainText('Background image added');
}

test('a background image goes to file storage once, and the map keeps only its address', async ({ page }) => {
  const { sb, doc } = server(page);
  await sb.install(USERS.siteManager);
  const problems: string[] = [];
  page.on('console', (m) => m.type() === 'error' && problems.push(m.text()));
  await page.goto(`/#/edit/${doc.id}`);
  await expect(status(page)).toHaveText(/Saved/);
  await addBackground(page);
  await expect(status(page)).toHaveText(/Saved/);
  expect(bgSrc(sb)).toMatch(STORED);
  expect([...sb.files.keys()]).toHaveLength(1);
  expect(sb.files.values().next().value!.body.equals(PNG.buffer)).toBe(true);
  expect(JSON.stringify(sb.maps[0].draft)).not.toContain('base64');

  // Saving a version and adding the same picture again store nothing new.
  await page.getByTestId('save').click();
  await expect(status(page)).toHaveText(/Saved/);
  expect(JSON.stringify(sb.versions.at(-1)?.doc)).not.toContain('base64');
  expect(sb.log.filter((l) => l.startsWith('POST /storage/'))).toHaveLength(1);

  // Opened again, the picture loads from storage (allowed by the page's security policy) and the floor still saves as a picture.
  const loaded = page.waitForResponse((r) => STORED.test(r.url()) && r.ok());
  await page.reload();
  await loaded;
  await expect(status(page)).toHaveText(/Saved/);
  const [shot] = await Promise.all([page.waitForEvent('download'), page.getByTestId('download-map').click().then(() => page.getByTestId('download-image').click())]);
  expect(shot.suggestedFilename()).toMatch(/\.png$/);

  // A map file carries the picture itself, so it opens anywhere.
  const [file] = await Promise.all([page.waitForEvent('download'), page.getByTestId('download-map').click().then(() => page.getByTestId('download-file').click())]);
  const saved = JSON.parse(readFileSync((await file.path())!, 'utf8'));
  expect(saved.map.floors[0].background.src).toBe(`data:image/png;base64,${PNG_B64}`);
  expect(problems.filter((p) => /Content Security Policy|tainted|CORS/i.test(p))).toEqual([]);
});

test('a map that still holds its picture inside moves it to file storage on its next save', async ({ page }) => {
  const { sb, doc } = server(page, `data:image/png;base64,${PNG_B64}`);
  await sb.install(USERS.owner);
  await page.goto(`/#/edit/${doc.id}`);
  await expect(status(page)).toHaveText(/Saved/);
  const name = page.getByTestId('map-name-input-top');
  await name.fill('Level 1 garage (moved)');
  await name.press('Enter');
  await expect(status(page)).toHaveText(/Saved/);
  expect(bgSrc(sb)).toMatch(STORED);
  // Later saves don't send it again, and aren't mistaken for someone else's change.
  await name.fill('Level 1 garage (again)');
  await name.press('Enter');
  await expect(status(page)).toHaveText(/Saved/);
  expect(sb.log.filter((l) => l.startsWith('POST /storage/'))).toHaveLength(1);
});

test('before the storage step is run, pictures stay inside maps and saving works as before', async ({ page }) => {
  const { sb, doc } = server(page);
  sb.storageMissing = true;
  await sb.install(USERS.siteManager);
  await page.goto(`/#/edit/${doc.id}`);
  await expect(status(page)).toHaveText(/Saved/);
  await addBackground(page);
  await expect(status(page)).toHaveText(/Saved/);
  expect(bgSrc(sb)).toBe(`data:image/png;base64,${PNG_B64}`);
});
