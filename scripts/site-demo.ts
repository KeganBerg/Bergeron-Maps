/**
 * Builds the product demo on the landing page (site/index.html) from the app's
 * own code: the map is a real quick-lot layout, and the spaces, lanes, signs
 * and library tiles are drawn by the same asset functions the editor uses, so
 * the website always shows what the software really looks like.
 *
 * Run: npx vite-node scripts/site-demo.ts   (npm run build:site runs it too)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { ASSETS, ASSET_BY_KEY, assetPreviewUrl, renderAssetSvg, searchAssets, svgDataUrl } from '../src/assets/library';
import { spaceMarks, spaceOutline } from '../src/assets/catalog/spaces';
import { createQuickLot } from '../src/model/quickLot';
import type { AssetDef } from '../src/assets/defs';
import type { MapObject } from '../src/model/types';

const NAVY = '#0b2545';
const r2 = (n: number) => Math.round(n * 100) / 100;
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

const doc = createQuickLot('Site Name', { floors: 2, rows: 4, spacesPerRow: 12, accessible: 2 });
const floor = doc.floors[0];

/** Strips the outer <svg> of an asset document so it can be nested inline. */
function inner(markup: string) {
  const m = markup.match(/^<svg[^>]*viewBox="([^"]+)"[^>]*>([\s\S]*)<\/svg>$/);
  return m ? { viewBox: m[1], body: m[2] } : { viewBox: '0 0 1 1', body: '' };
}

let uid = 0;
/** Pattern ids inside asset drawings must be unique once inlined together. */
function uniq(body: string) {
  const ids = [...body.matchAll(/id="([^"]+)"/g)].map((m) => m[1]);
  for (const id of new Set(ids)) {
    const n = `dm${++uid}`;
    body = body.split(`id="${id}"`).join(`id="${n}"`).split(`url(#${id})`).join(`url(#${n})`);
  }
  return body;
}

function objectSvg(o: MapObject): string {
  const t = `translate(${r2(o.x)} ${r2(o.y)}) rotate(${o.rotation}) translate(${r2(-o.width / 2)} ${r2(-o.height / 2)})`;
  if (o.kind === 'space') {
    const v = o.variant ?? (o.accessible ? 'accessible' : 'standard');
    const marks = spaceMarks(v, o.width, o.height, o.labelPlacement ?? 'center', NAVY);
    const row = o.label.replace(/^\d*([A-Z]+).*$/, '$1');
    const size = Math.max(9, Math.min(24, Math.min(o.width, o.height) * 0.34));
    return `<g class="sp" data-row="${row}" data-label="${esc(o.label)}" transform="${t}">` +
      `<rect class="sp-body" width="${o.width}" height="${o.height}" fill="#ffffff" stroke="${NAVY}" stroke-width="1.5"/>${uniq(marks)}` +
      `<text x="${r2(o.width / 2)}" y="${r2(o.height / 2)}" font-size="${r2(size)}">${esc(o.label)}</text></g>`;
  }
  if (o.kind === 'asset') {
    const def = ASSET_BY_KEY[o.assetKey];
    const { viewBox, body } = inner(renderAssetSvg(def, o));
    const id = { entrance: 'dm-entrance', exit: 'dm-exit', ramp: 'dm-ramp', stairs: 'dm-stairs', elevator: 'dm-elevator' }[o.assetKey];
    return `<g${id ? ` id="${id}"` : ''} class="as as-${o.assetKey}" transform="${t}"><svg width="${o.width}" height="${o.height}" viewBox="${viewBox}" overflow="visible">${uniq(body)}</svg></g>`;
  }
  return '';
}

// Same order as the editor: by layer, then by object order.
const byLayer = floor.layers.flatMap((l) => floor.objects.filter((o) => o.layerId === l.id));
const world = byLayer.map(objectSvg).join('');

// A spare Staircase for the "add a landmark" demo, dropped next to the lane.
const stairDef = ASSET_BY_KEY.stairs;
const stairs = floor.objects.find((o) => o.kind === 'asset' && o.assetKey === 'stairs')!;
const extra = inner(renderAssetSvg(stairDef, { width: stairDef.width, height: stairDef.height }));
const dropped = `<g id="dm-drop" transform="translate(${r2(stairs.x - stairDef.width / 2)} ${r2(stairs.y + 150)})"><svg width="${stairDef.width}" height="${stairDef.height}" viewBox="${extra.viewBox}" overflow="visible">${uniq(extra.body)}</svg></g>`;

// Bounds of everything, in map units, so the page can fit the view the same way the editor does.
const xs = floor.objects.flatMap((o) => [o.x - Math.max(o.width, o.height) / 2, o.x + Math.max(o.width, o.height) / 2]);
const ys = floor.objects.flatMap((o) => [o.y - Math.max(o.width, o.height) / 2, o.y + Math.max(o.width, o.height) / 2]);
const box = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };

const map = `<g id="dm-world" data-box="${r2(box.x)} ${r2(box.y)} ${r2(box.w)} ${r2(box.h)}">${world}${dropped}</g>`;

// Library tiles, drawn the way the editor's library draws them.
function tileUrl(def: AssetDef): string {
  if ((def.creates ?? 'asset') === 'space') {
    const v = def.variant ?? 'standard';
    const pts = spaceOutline(v, def.width, def.height);
    const pad = 2;
    const path = `M${pts[0]} ${pts[1]}L${pts[2]} ${pts[3]}L${pts[4]} ${pts[5]}L${pts[6]} ${pts[7]}Z`;
    return svgDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-pad} ${-pad} ${def.width + pad * 2} ${def.height + pad * 2}"><path d="${path}" fill="#ffffff" stroke="${NAVY}" stroke-width="2"/>${spaceMarks(v, def.width, def.height, 'center', NAVY)}</svg>`);
  }
  return assetPreviewUrl(def) ?? '';
}
const tile = (def: AssetDef, cls = '') =>
  `<div class="am-tile${cls}" data-key="${def.key}"><img src="${tileUrl(def)}" alt=""><span>${esc(def.name)}</span></div>`;
const parking = ASSETS.filter((a) => a.category === 'Parking spaces').slice(0, 9).map((d) => tile(d)).join('');
const valet = ASSETS.filter((a) => a.category === 'Valet operations').slice(0, 3).map((d) => tile(d)).join('');
const found = searchAssets('stair').slice(0, 6).map((d) => tile(d, d.key === 'stairs' ? ' am-stairs' : '')).join('');

const total = ASSETS.length;
const p = new URL('../site/index.html', import.meta.url);
let html = readFileSync(p, 'utf8');
const put = (name: string, value: string) => {
  const re = new RegExp(`<!--${name}-->[\\s\\S]*?<!--/${name}-->`);
  if (!re.test(html)) throw new Error(`marker ${name} missing`);
  html = html.replace(re, () => `<!--${name}-->${value}<!--/${name}-->`);
};
put('DM-MAP', map);
put('DM-PARKING', parking);
put('DM-VALET', valet);
put('DM-SEARCH', found);
put('DM-COUNT', String(total));
writeFileSync(p, html);
console.log(`demo ok: ${floor.objects.length} objects, ${total} library items`);
