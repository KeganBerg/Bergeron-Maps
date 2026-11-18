// Screenshots of the join test maps (scenes.ts) in the real viewer, for before/after comparison.
// Run: npx vite --port 5191 & node scripts/asset-audit/shoot.mjs <outDir> [scene ...]
import { chromium } from 'playwright';
const BASE = process.env.BASE || 'http://localhost:5191';
const [out = 'shots', ...only] = process.argv.slice(2);
const SCALE = Number(process.env.SCALE || 1);
const names = only.length ? only : ['lot', 'garage', 'roads', 'quick'];
const browser = await chromium.launch();
for (const name of names) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: SCALE });
  await page.goto(BASE + '/');
  const id = await page.evaluate(async (n) => {
    const { SCENES } = await import('/scripts/asset-audit/scenes.ts');
    const { repository } = await import('/src/storage/indexedDbRepository.ts');
    const doc = SCENES[n]();
    await repository.createMap(doc);
    await repository.publishMap(doc.id);
    return doc.id;
  }, name);
  await page.goto(`${BASE}/#/view/${id}`);
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `${out}/${name}.png` });
  await page.close();
}
await browser.close();
