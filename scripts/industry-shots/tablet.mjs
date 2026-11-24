// Still pictures of the real viewer on a tablet, one per sample site, for the device
// picture at the top of the purchase page (site/get-your-map/). The tablet does what the
// phone clip does (clips.mjs): search for the page's example, then walking directions to it.
// Run: npx vite --port 5190 & node scripts/industry-shots/tablet.mjs [scene ...]
// Output: site/img/industries/<scene>-tablet.webp
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { INDUSTRIES } from '../site-pages.mjs';
import { PLAN } from './plan.mjs';

const BASE = process.env.BASE || 'http://localhost:5190';
const OUT = process.env.OUT || 'site/img/industries';
const only = process.argv.slice(2);
const names = only.length ? only : Object.keys(PLAN);

const browser = await chromium.launch();
for (const name of names) {
  const find = INDUSTRIES.find((i) => i.scene === name).sample.find;
  // An 11-inch tablet held upright.
  const ctx = await browser.newContext({
    viewport: { width: 834, height: 1194 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
  });
  const page = await ctx.newPage();
  await page.goto(BASE + '/');
  const id = await page.evaluate(async (n) => {
    const { SCENES } = await import('/scripts/industry-shots/scenes.ts');
    const { repository } = await import('/src/storage/indexedDbRepository.ts');
    const doc = SCENES[n]();
    await repository.createMap(doc);
    await repository.publishMap(doc.id);
    return doc.id;
  }, name);
  await page.goto(`${BASE}/#/view/${id}`);
  await page.getByTestId('viewer-search').waitFor();
  await page.waitForTimeout(1200);
  await page.getByTestId('viewer-search').tap();
  await page.keyboard.type(find);
  await page.waitForTimeout(500);
  await page.locator('[data-testid="search-results"] li:first-child button').tap();
  await page.waitForTimeout(1500);
  await page.getByTestId('directions').tap();
  await page.waitForTimeout(700);
  await page.locator(`[data-testid="dir-start"]:has-text("${PLAN[name].from}")`).first().tap();
  await page.waitForTimeout(3000);
  const step = PLAN[name].step;
  if (step) {
    await page.locator(`[data-testid="directions-sheet"] button:has-text("${step}")`).first().tap();
    await page.waitForTimeout(3000);
  }
  const png = `${OUT}/${name}-tablet.png`;
  await page.screenshot({ path: png });
  execFileSync('python3', [
    '-c',
    `from PIL import Image; Image.open(${JSON.stringify(png)}).convert('RGB').save(${JSON.stringify(png.replace(/\.png$/, '.webp'))}, quality=82, method=6)`,
  ]);
  rmSync(png);
  await ctx.close();
  console.log('tablet', name);
}
await browser.close();
