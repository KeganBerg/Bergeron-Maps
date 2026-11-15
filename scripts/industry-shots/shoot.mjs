// Screenshots of the real app for the industry pages (site/img/industries/).
// Run: npx vite --port 5190 & node scripts/industry-shots/shoot.mjs [scene ...]
// Each sample map is built by scenes.ts, saved in the app's own storage, then shown in the editor and on a phone.
// The site uses WebP copies: editor shots resized to 2000px wide, phones at 780px, quality 82 (Pillow).
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://localhost:5190';
const OUT = process.env.OUT || 'site/img/industries';
const SCALE = Number(process.env.SCALE || 2);

// What the phone searches for on each map.
const FIND = { dealership: 'U19', warehouse: 'C-07', school: 'F10', valet: '3C9', office: 'Conference room' };
// What the editor's library search shows on each map.
const LIB = { dealership: 'inventory', warehouse: 'loading', school: 'school', valet: 'valet', office: 'office' };
const only = process.argv.slice(2);
const names = only.length ? only : Object.keys(FIND);

const browser = await chromium.launch();

async function seed(page, name) {
  await page.goto(BASE + '/');
  return page.evaluate(async (n) => {
    const { SCENES } = await import('/scripts/industry-shots/scenes.ts');
    const { repository } = await import('/src/storage/indexedDbRepository.ts');
    const doc = SCENES[n]();
    await repository.createMap(doc);
    await repository.publishMap(doc.id);
    return doc.id;
  }, name);
}

for (const name of names) {
  // Editor, desktop.
  const desk = await browser.newPage({ viewport: { width: 1440, height: 880 }, deviceScaleFactor: SCALE });
  const id = await seed(desk, name);
  await desk.goto(`${BASE}/#/edit/${id}`);
  await desk.waitForTimeout(1200);
  await desk.getByPlaceholder(/Search .* objects/).fill(LIB[name]);
  await desk.mouse.move(5, 870);
  await desk.waitForTimeout(600);
  await desk.screenshot({ path: `${OUT}/${name}-editor.png` });
  await desk.close();

  // Viewer, phone, with a search.
  const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, deviceScaleFactor: SCALE, isMobile: true, hasTouch: true });
  const phone = await ctx.newPage();
  const pid = await seed(phone, name);
  await phone.goto(`${BASE}/#/view/${pid}`);
  await phone.waitForTimeout(1200);
  const q = phone.getByTestId('viewer-search');
  await q.fill(FIND[name]);
  await q.press('Enter');
  await phone.waitForTimeout(1200);
  if (name === 'valet') {
    await phone.getByRole('button', { name: 'Directions' }).click();
    await phone.waitForTimeout(800);
    await phone.getByRole('button', { name: /^Entrance/ }).click();
    await phone.waitForTimeout(1500);
  }
  await phone.screenshot({ path: `${OUT}/${name}-phone.png` });
  await ctx.close();
  console.log('shot', name);
}
await browser.close();
