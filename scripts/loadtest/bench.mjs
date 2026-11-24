// Load test: imports each synthetic site into the production build and times what a manager
// and an employee do: on a desktop, a slow laptop (4x slower CPU) and a phone (4x slower CPU).
// Usage: npm run loadtest (writes loadtest-out/*.bmap.json), npm run build, npx vite preview --port 4180,
// then npm run loadtest:browser [tower|sprawl|campus...]. BASE=<url> points it at another server.
import { chromium, devices } from 'playwright';
import { writeFileSync } from 'node:fs';

const dir = process.argv[2] ?? 'loadtest-out';
const only = process.argv.slice(3);
const BASE = process.env.BASE ?? 'http://localhost:4180/';
const sites = only.length ? only : ['tower', 'sprawl', 'campus'];
const settle = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 0)))));
async function timed(page, run) { const t = Date.now(); await run(); await settle(page); return Date.now() - t; }
const results = [];

async function open(browser, phone, cpu) {
  const ctx = await browser.newContext(phone ? { ...devices['Pixel 7'] } : { viewport: { width: 1400, height: 860 } });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  if (cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
  await page.addInitScript(() => {
    window.__long = 0; window.__longMax = 0;
    new PerformanceObserver((l) => { for (const e of l.getEntries()) { window.__long += e.duration; window.__longMax = Math.max(window.__longMax, e.duration); } }).observe({ entryTypes: ['longtask'] });
  });
  return { ctx, page, cdp };
}
const heap = (page) => page.evaluate(() => Math.round((performance.memory?.usedJSHeapSize ?? 0) / 1048576));
const canvasBox = async (page) => (await page.getByTestId('canvas').boundingBox()) ?? (await page.locator('canvas').first().boundingBox());

async function editor(browser, site, label, cpu) {
  const { ctx, page } = await open(browser, false, cpu);
  const r = { site, profile: label, part: 'editor' };
  await page.goto(BASE);
  await page.getByTestId('import-map-input').waitFor({ state: 'attached' });
  r.importToDrawn = await timed(page, async () => {
    await page.getByTestId('import-map-input').setInputFiles(`${dir}/${site}.bmap.json`);
    await page.getByTestId('canvas').locator('canvas').first().waitFor({ timeout: 120_000 });
  });
  const id = page.url().split('/edit/')[1];
  await page.getByTestId('save-status').filter({ hasText: /Saved/ }).waitFor({ timeout: 120_000 }).catch(() => {});
  r.reopen = await timed(page, async () => { await page.goto(BASE + '#/'); await page.goto(BASE + `#/edit/${id}`); await page.getByTestId('canvas').locator('canvas').first().waitFor({ timeout: 120_000 }); });
  const c = await canvasBox(page);
  await page.mouse.click(c.x + 5, c.y + c.height - 5);
  const tabs = await page.locator('[data-testid^="floor-tab-"]').count();
  if (tabs > 1) r.floorSwitch = await timed(page, () => page.locator('[data-testid^="floor-tab-"]').nth(tabs - 1).click());
  await page.mouse.move(c.x + c.width / 2, c.y + c.height / 2);
  r.zoomInStep = await timed(page, () => page.mouse.wheel(0, -300));
  r.zoomOutStep = await timed(page, () => page.mouse.wheel(0, 300));
  const pan = [];
  await page.keyboard.down('Space'); await page.mouse.down();
  for (let i = 1; i <= 5; i++) pan.push(await timed(page, () => page.mouse.move(c.x + c.width / 2 + i * 30, c.y + c.height / 2 + i * 10)));
  await page.mouse.up(); await page.keyboard.up('Space');
  r.panFrame = Math.round(pan.reduce((a, b) => a + b) / pan.length);
  r.selectAll = await timed(page, () => page.keyboard.press('Control+a'));
  r.arrowMoveAll = await timed(page, () => page.keyboard.press('ArrowRight'));
  r.undo = await timed(page, () => page.keyboard.press('Control+z'));
  await page.keyboard.press('Escape');
  // One small edit, then the time until it is saved (the debounce is included and subtracted below).
  const t0 = Date.now();
  await page.keyboard.press('Control+a'); await page.keyboard.press('ArrowDown');
  await page.getByTestId('save-status').filter({ hasText: /Saving|Unsaved|Not saved/ }).waitFor({ timeout: 10_000 }).catch(() => {});
  await page.getByTestId('save-status').filter({ hasText: /^Saved/ }).waitFor({ timeout: 120_000 });
  r.editToSaved = Date.now() - t0;
  r.publish = await timed(page, async () => { await page.getByTestId('publish').click(); await page.getByTestId('publish').filter({ hasText: 'Published' }).waitFor({ timeout: 120_000 }); });
  r.heapMB = await heap(page);
  r.longTaskTotal = Math.round(await page.evaluate(() => window.__long));
  r.longTaskMax = Math.round(await page.evaluate(() => window.__longMax));
  await ctx.close();
  return { r, id };
}

async function viewer(browser, site, id, label, phone, cpu, storage) {
  const { ctx, page } = await open(browser, phone, cpu);
  const r = { site, profile: label, part: 'viewer' };
  // The map lives in this browser's IndexedDB; copy it over from the editor context.
  await page.goto(BASE);
  await page.evaluate(async (dump) => {
    for (const [dbName, stores] of Object.entries(dump)) {
      const db = await new Promise((res, rej) => { const q = indexedDB.open(dbName); q.onsuccess = () => res(q.result); q.onerror = rej; });
      for (const [store, rows] of Object.entries(stores)) {
        if (!db.objectStoreNames.contains(store)) continue;
        const tx = db.transaction(store, 'readwrite'); const os = tx.objectStore(store);
        for (const [k, v] of rows) os.keyPath ? os.put(v) : os.put(v, k);
        await new Promise((res) => (tx.oncomplete = res));
      }
    }
  }, storage);
  r.coldLoad = await timed(page, async () => {
    await page.goto(BASE + `#/view/${id}`);
    await page.locator('canvas').first().waitFor({ timeout: 120_000 });
    await page.getByTestId('viewer-search').waitFor();
  });
  const c = await page.locator('canvas').first().boundingBox();
  const floors = await page.locator('[data-testid^="viewer-floor-"]').count();
  if (floors > 1) r.floorSwitch = await timed(page, () => page.locator('[data-testid^="viewer-floor-"]').nth(floors - 1).click());
  const q = site === 'tower' ? '12Z80' : site === 'campus' ? '6T50' : 'CZ80';
  r.searchToCard = await timed(page, async () => {
    await page.getByTestId('viewer-search').fill(q); await page.getByTestId('viewer-search').press('Enter');
    await page.getByTestId('info-card').waitFor();
  });
  r.directions = await timed(page, async () => {
    await page.getByTestId('directions').click();
    const start = page.getByTestId('dir-start').first();
    await start.waitFor({ timeout: 10_000 }).then(() => start.click()).catch(() => {});
    await page.getByTestId('dir-summary').waitFor({ timeout: 60_000 });
  }).catch(() => -1);
  await page.getByTestId('dir-close').click().catch(() => {});
  await page.getByTestId('reset-view').click().catch(() => {});
  await settle(page);
  if (phone) {
    r.tapSpace = await timed(page, () => page.touchscreen.tap(c.x + c.width / 2, c.y + c.height / 2));
  } else {
    r.tapSpace = await timed(page, () => page.mouse.click(c.x + c.width / 2, c.y + c.height / 2));
    await page.mouse.move(c.x + c.width / 2, c.y + c.height / 2);
    r.zoomInStep = await timed(page, () => page.mouse.wheel(0, -300));
  }
  r.heapMB = await heap(page);
  r.longTaskTotal = Math.round(await page.evaluate(() => window.__long));
  r.longTaskMax = Math.round(await page.evaluate(() => window.__longMax));
  await ctx.close();
  return r;
}


const browser = await chromium.launch();
for (const site of sites) {
  // Editor on a desktop, and on a slow laptop (4x CPU).
  const { r } = await editor(browser, site, 'desktop', 1);
  results.push(r); console.log(JSON.stringify(r));
  const slow = await editor(browser, site, 'slow-laptop-4x', 4);
  results.push(slow.r); console.log(JSON.stringify(slow.r));
  // Grab the stored maps from a fresh context that imports once, so the viewer can open it.
  const { ctx, page } = await open(browser, false, 1);
  await page.goto(BASE);
  await page.getByTestId('import-map-input').setInputFiles(`${dir}/${site}.bmap.json`);
  await page.getByTestId('canvas').locator('canvas').first().waitFor({ timeout: 120_000 });
  const vid = page.url().split('/edit/')[1];
  await page.getByTestId('publish').click(); await page.getByTestId('publish').filter({ hasText: 'Published' }).waitFor({ timeout: 120_000 });
  const storage = await page.evaluate(async () => {
    const out = {};
    for (const { name } of await indexedDB.databases()) {
      const db = await new Promise((res) => { const q = indexedDB.open(name); q.onsuccess = () => res(q.result); });
      out[name] = {};
      for (const s of db.objectStoreNames) {
        const tx = db.transaction(s); const os = tx.objectStore(s);
        const [keys, vals] = await Promise.all([os.getAllKeys(), os.getAll()].map((q) => new Promise((res) => (q.onsuccess = () => res(q.result)))));
        out[name][s] = keys.map((k, i) => [k, vals[i]]);
      }
    }
    return out;
  });
  await ctx.close();
  for (const [label, phone, cpu] of [['desktop', false, 1], ['phone-4x', true, 4]]) {
    const v = await viewer(browser, site, vid, label, phone, cpu, storage);
    results.push(v); console.log(JSON.stringify(v));
  }
}
await browser.close();
writeFileSync(`${dir}/results.json`, JSON.stringify(results, null, 2));
