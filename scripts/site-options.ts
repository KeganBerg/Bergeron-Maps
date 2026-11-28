/**
 * Builds the website design options for review (previews/site-options/).
 * They are not part of the live site. Each option is one self-contained HTML
 * page, so it can be opened straight from disk or shared as a preview link.
 *
 * The maps in them are the same drawings the live home page uses, made by the
 * app's own code (scripts/site-demo.ts writes them into site/index.html), plus
 * the app's side view of a four-level garage for option B.
 *
 * Run: npx vite-node scripts/site-options.ts
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createQuickLot } from '../src/model/quickLot';
import { sideView } from '../src/model/sideView';
import { SideViewDrawing } from '../src/viewer/SideView';
import { ASSETS, assetPreviewUrl } from '../src/assets/library';

const root = new URL('../', import.meta.url);
const read = (p: string) => readFileSync(new URL(p, root), 'utf8');
const home = read('site/index.html');
const block = (name: string) => {
  const m = home.match(new RegExp(`<!--${name}-->([\\s\\S]*?)<!--/${name}-->`));
  if (!m) throw new Error(`marker ${name} missing in site/index.html`);
  return m[1];
};

// The hero block holds the line drawing (#plan) followed by the app's drawing (#hr-real).
const hero = block('HERO-PLAN');
const cut = hero.indexOf('<svg id="hr-real"');
const plan = hero.slice(0, cut);
const real = hero.slice(cut);

// Header logo: the traced monogram and wordmark, exactly as the live header draws them.
const a = home.indexOf('<a href="#top" class="flex items-center gap-3"');
const mark = home.slice(home.indexOf('<svg', a), home.indexOf('</svg>', a) + 6).replace(/ class="[^"]*"/, '');
const word = read('site/wordmark.svg')
  .trim()
  .replace('<svg ', '<svg aria-hidden="true" ')
  .replace(/fill="#ffffff"/g, 'fill="currentColor"');
const logo = mark + word;

// Option B: the side view of a four-level garage, once per level, each with one space found.
const garage = createQuickLot('Site Name', { floors: 4, rows: 4, spacesPerRow: 12, accessible: 0 });
garage.floors.forEach((f, i) => {
  f.name = `Level ${i + 1}`;
});
const finds = ['1A4', '2B10', '3C9', '4D2'];
const sides = finds.map((label, i) => {
  const f = garage.floors[i];
  const sp = f.objects.find((o) => o.kind === 'space' && o.label === label)!;
  return renderToStaticMarkup(
    createElement(SideViewDrawing, {
      model: sideView(garage, garage.floors, { focusId: sp.id }),
      width: 1200,
      accent: '#ffffff',
      idPrefix: `sv${i}`,
    }),
  ).replace(/ data-testid="[^"]*"/g, '');
});
// One drawing, plus the found-space callout from each of the four.
const markOf = (svg: string) => svg.slice(svg.indexOf('<g class="sv-mark"'), svg.lastIndexOf('</svg>'));
const base = sides[0].replace(markOf(sides[0]), '');
const side = base.replace(
  '</svg>',
  sides.map((s, i) => markOf(s).replace('<g class="sv-mark"', `<g class="sv-mark" data-level="${i + 1}"`)).join('') +
    '</svg>',
);

const webp = (name: string) =>
  `data:image/webp;base64,${readFileSync(new URL(`site/img/industries/${name}.webp`, root)).toString('base64')}`;
const gsap = read('site/vendor/gsap.min.js');

// Option D: the hero floor as four levels of a garage (same layout, spaces renumbered per level, as quick lot numbers them).
const floors = [1, 2, 3, 4]
  .map((n) =>
    real
      .replace(/(>|data-find="|data-label=")1([A-D]\d{1,2})(<|")/g, `$1${n}$2$3`)
      .replace(/id="hr-(real|world|route|ring|entrance)"/g, `id="f${n}-$1"`)
      .replace(/ role="img" aria-label="[^"]*"/, ' aria-hidden="true"'),
  )
  .map((svg, i) => `<div class="plate" data-level="${i + 1}"><div class="edge"></div>${svg}</div>`)
  .join('');

// Option E: the app's own library symbols, as the editor's library tiles draw them.
// Taken a category at a time, so every kind of site is in the mix.
const skip = new Set([
  'Drawing elements',
  'Text and labels',
  'Background and reference',
  'Custom and reusable',
  'Zones and boundaries',
]);
const byCat = new Map<string, { n: string; c: string; u: string }[]>();
for (const a of ASSETS) {
  const u = assetPreviewUrl(a);
  if (!u || u.length > 9000 || skip.has(a.category)) continue;
  byCat.set(a.category, [...(byCat.get(a.category) ?? []), { n: a.name, c: a.category, u }]);
}
const icons: { n: string; c: string; u: string }[] = [];
for (let i = 0; icons.length < 320 && i < 60; i++)
  for (const list of byCat.values()) if (list[i] && icons.length < 320) icons.push(list[i]);

// Option F: the hero map as one picture, to show through the headline letters.
const mapUrl = `data:image/svg+xml;base64,${Buffer.from(
  real
    .replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ')
    // A picture can't see the page's CSS, so the space numbers bring their own type.
    .replace(
      '>',
      '><style>.sp text{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans",Helvetica,Arial,sans-serif;font-weight:700;text-anchor:middle;dominant-baseline:central;fill:#0b2545}</style>',
    ),
).toString('base64')}`;

const vbox = real
  .match(/viewBox="([^"]+)"/)![1]
  .split(' ')
  .map(Number);
const t12 = real.match(/data-find="1C12"[^>]*data-x="([^"]+)" data-y="([^"]+)" data-w="([^"]+)" data-h="([^"]+)"/)!;

// Option F, full page: every searchable thing on the hero floor, and the line drawing as a picture.
const findables = [
  ...real.matchAll(
    /data-find="([^"]+)" data-kind="([^"]+)" data-x="([^"]+)" data-y="([^"]+)" data-w="([^"]+)" data-h="([^"]+)"/g,
  ),
].map((m) => ({
  n: m[1],
  k: m[2],
  x: +m[3],
  y: +m[4],
  w: +m[5],
  h: +m[6],
}));
const planPic = plan
  .replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" color="#2e3740" ')
  .replace(/ class="[^"]*"/, '')
  .replace(
    '<g>',
    `<style>text{fill:#2e3740;stroke:none;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;font-size:11px;text-anchor:middle}.bp-num{font-weight:600}.bp-note{font-size:10px}.bp-aisle{stroke-dasharray:10 8}</style><rect x="${vbox[0]}" y="${vbox[1]}" width="${vbox[2]}" height="${vbox[3]}" fill="#fbfcfb" stroke="none"/><g>`,
  );
const planUrl = `data:image/svg+xml;base64,${Buffer.from(planPic).toString('base64')}`;

const parts: Record<string, string> = {
  FINDS: JSON.stringify(findables),
  PLANURL: planUrl,
  TAB_VALET: webp('valet-tablet'),
  ED_SCHOOL: webp('school-editor'),
  ED_DEALER: webp('dealership-editor'),
  ED_VALET: webp('valet-editor'),
  ED_WAREHOUSE: webp('warehouse-editor'),
  ED_OFFICE: webp('office-editor'),
  VIEWBOX: JSON.stringify(vbox),
  TARGET: JSON.stringify({ x: +t12[1], y: +t12[2], w: +t12[3], h: +t12[4] }),
  FLOORS: floors,
  ICONS: JSON.stringify(icons),
  ICONCOUNT: String(ASSETS.length),
  MAPURL: mapUrl,
  PLAN: plan,
  REAL: real,
  LOGO: logo,
  SIDE: side,
  GSAP: `<script>${gsap}</script>`,
  SCHOOL: webp('school-phone'),
  DEALER: webp('dealership-phone'),
  VALET: webp('valet-phone'),
  WAREHOUSE: webp('warehouse-phone'),
  OFFICE: webp('office-phone'),
};

const src = new URL('previews/site-options/src/', root);
for (const file of readdirSync(src).filter((f) => f.endsWith('.html'))) {
  const html = readFileSync(new URL(file, src), 'utf8').replace(/\{\{([A-Z_]+)\}\}/g, (all, k: string) => {
    if (!(k in parts)) throw new Error(`${file}: unknown part ${k}`);
    return parts[k];
  });
  writeFileSync(new URL(`previews/site-options/${file}`, root), html);
  console.log(`wrote previews/site-options/${file} (${Math.round(html.length / 1024)} KB)`);
}
