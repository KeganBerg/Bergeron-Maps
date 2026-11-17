// Social preview images (Open Graph, 1200x630) for bergeronmaps.com.
// Screenshots the top of each page as it really looks, so the preview never drifts from the site.
//   node scripts/og-shots.mjs        (after `npm run build:site`)
// Writes site/img/og.png (home) and site/img/og/<industry>.png. Re-run it when a hero changes.
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { chromium } from 'playwright';
import { INDUSTRIES } from './site-pages.mjs';

const ROOT = 'site';
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };

const server = createServer((req, res) => {
  let path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  let file = join(ROOT, path);
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
mkdirSync(join(ROOT, 'img/og'), { recursive: true });

const shots = [{ path: '', out: 'img/og.png' }, ...INDUSTRIES.map((i) => ({ path: `industries/${i.slug}/`, out: `img/og/${i.slug}.png` }))];
for (const s of shots) {
  await page.goto(base + s.path, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  // The preview is the page's hero, so the header bar is left out.
  await page.addStyleTag({ content: '.site-head{display:none!important}' });
  // Let the home page's search demo settle on its found space.
  await page.waitForTimeout(s.path ? 300 : 4000);
  await page.screenshot({ path: join(ROOT, s.out) });
  console.log('og:', s.out);
}
await browser.close();
server.close();
