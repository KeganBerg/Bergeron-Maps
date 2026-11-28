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

const parts: Record<string, string> = {
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
  const html = readFileSync(new URL(file, src), 'utf8').replace(/\{\{([A-Z]+)\}\}/g, (all, k: string) => {
    if (!(k in parts)) throw new Error(`${file}: unknown part ${k}`);
    return parts[k];
  });
  writeFileSync(new URL(`previews/site-options/${file}`, root), html);
  console.log(`wrote previews/site-options/${file} (${Math.round(html.length / 1024)} KB)`);
}
