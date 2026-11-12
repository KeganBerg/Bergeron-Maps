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

function objectSvg(o: MapObject, ids: Record<string, string> = DEMO_IDS, findable = false): string {
  const t = `translate(${r2(o.x)} ${r2(o.y)}) rotate(${o.rotation}) translate(${r2(-o.width / 2)} ${r2(-o.height / 2)})`;
  if (o.kind === 'space') {
    const v = o.variant ?? (o.accessible ? 'accessible' : 'standard');
    const marks = spaceMarks(v, o.width, o.height, o.labelPlacement ?? 'center', NAVY);
    const row = o.label.replace(/^\d*([A-Z]+).*$/, '$1');
    const size = Math.max(9, Math.min(24, Math.min(o.width, o.height) * 0.34));
    const find = findable ? ` data-find="${esc(o.label)}" data-kind="Parking space" data-x="${r2(o.x)}" data-y="${r2(o.y)}" data-w="${o.width}" data-h="${o.height}"` : '';
    return `<g class="sp" data-row="${row}" data-label="${esc(o.label)}"${find} transform="${t}">` +
      `<rect class="sp-body" width="${o.width}" height="${o.height}" fill="#ffffff" stroke="${NAVY}" stroke-width="1.5"/>${uniq(marks)}` +
      `<text x="${r2(o.width / 2)}" y="${r2(o.height / 2)}" font-size="${r2(size)}">${esc(o.label)}</text></g>`;
  }
  if (o.kind === 'asset') {
    const def = ASSET_BY_KEY[o.assetKey];
    const { viewBox, body } = inner(renderAssetSvg(def, o));
    const id = ids[o.assetKey];
    const find = findable && o.assetKey !== 'road' ? ` data-find="${esc(o.name ?? def.name)}" data-kind="${esc(def.name)}" data-x="${r2(o.x)}" data-y="${r2(o.y)}" data-w="${o.width}" data-h="${o.height}"` : '';
    return `<g${id ? ` id="${id}"` : ''}${find} class="as as-${o.assetKey}" transform="${t}"><svg width="${o.width}" height="${o.height}" viewBox="${viewBox}" overflow="visible">${uniq(body)}</svg></g>`;
  }
  return '';
}

const DEMO_IDS: Record<string, string> = { entrance: 'dm-entrance', exit: 'dm-exit', ramp: 'dm-ramp', stairs: 'dm-stairs', elevator: 'dm-elevator' };

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


// ---------------------------------------------------------------- hero
// The hero shows one floor twice: first as a line drawing, then as the real
// app renders it. Both are drawn from the same quick-lot layout, plus a few
// things that aren't parking spaces (office, key box, chargers, restrooms).
const heroDoc = createQuickLot('Site Name', { floors: 2, rows: 4, spacesPerRow: 16, accessible: 2 });
const hf = heroDoc.floors[0];
const hlayer = (key: string) => hf.layers.find((l) => l.role === ASSET_BY_KEY[key].layer)!.id;
let hid = 0;
const add = (key: string, x: number, y: number, name: string, label?: string) => {
  const d = ASSET_BY_KEY[key];
  hf.objects.push({ id: `hx${++hid}`, kind: 'asset', assetKey: key, layerId: hlayer(key), x, y, width: d.width, height: d.height, rotation: 0, name, ...(label ? { label } : {}) } as MapObject);
};
const rowEnd = 16 * 45;
add('parking-office', rowEnd + 150, 330, 'Parking office', 'Office');
add('key-box', rowEnd + 70, 400, 'Key box');
add('restroom', rowEnd + 150, 520, 'Restrooms');
for (const n of [15, 16]) {
  const sp = hf.objects.find((o) => o.kind === 'space' && o.label === `1D${n}`);
  if (sp && sp.kind === 'space') { sp.variant = 'ev'; add('ev-charger', sp.x, sp.y + 62, `EV charger ${n - 14}`); }
}
const hb = (() => {
  const xs: number[] = [], ys: number[] = [];
  for (const o of hf.objects) {
    const rad = (o.rotation * Math.PI) / 180, c = Math.abs(Math.cos(rad)), s2 = Math.abs(Math.sin(rad));
    const hw = (o.width * c + o.height * s2) / 2, hh = (o.width * s2 + o.height * c) / 2;
    xs.push(o.x - hw, o.x + hw); ys.push(o.y - hh, o.y + hh);
  }
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
})();
const pad = 46;
const vb = `${r2(hb.x - pad)} ${r2(hb.y - pad - 40)} ${r2(hb.w + pad * 2)} ${r2(hb.h + pad * 2 + 70)}`;

/** Blueprint version of each object: outlines, centre lines, and labels in drafting type. */
function lineSvg(o: MapObject): string {
  const t = `translate(${r2(o.x)} ${r2(o.y)}) rotate(${o.rotation})`;
  const w = o.width, h = o.height;
  if (o.kind === 'space') {
    return `<g transform="${t}"><path class="bp-stall" d="M${r2(-w / 2)} ${r2(-h / 2)}V${r2(h / 2)}M${r2(w / 2)} ${r2(-h / 2)}V${r2(h / 2)}M${r2(-w / 2)} ${r2(h / 2)}H${r2(w / 2)}"/><text class="bp-num" y="4">${esc(o.label)}</text></g>`;
  }
  if (o.kind !== 'asset') return '';
  if (o.assetKey === 'road') {
    return `<g transform="${t}"><path d="M${r2(-w / 2)} ${r2(-h / 2)}H${r2(w / 2)}M${r2(-w / 2)} ${r2(h / 2)}H${r2(w / 2)}" stroke-width=".8" opacity=".5"/><path class="bp-aisle" d="M${r2(-w / 2 + 10)} 0H${r2(w / 2 - 10)}"/></g>`;
  }
  const name = (o.name ?? '').replace(/ \d+$/, '').toUpperCase();
  return `<g transform="${t}"><rect class="bp-box" x="${r2(-w / 2)}" y="${r2(-h / 2)}" width="${w}" height="${h}"/>` +
    `<path d="M${r2(-w / 2)} ${r2(-h / 2)}L${r2(w / 2)} ${r2(h / 2)}" stroke-width=".5" opacity=".45"/>` +
    `<text class="bp-note" y="${r2(h / 2 + 13)}">${esc(name)}</text></g>`;
}
const hByLayer = hf.layers.flatMap((l) => hf.objects.filter((o) => o.layerId === l.id));
const dimY = hb.y - 24;
const extras =
  `<path d="M0 ${r2(dimY)}H${rowEnd}M0 ${r2(dimY - 6)}v12M${rowEnd} ${r2(dimY - 6)}v12" stroke-width=".8"/>` +
  `<text class="bp-note" x="${rowEnd / 2}" y="${r2(dimY - 8)}">16 SPACES @ 9'-0" = 144'-0"</text>` +
  `<g transform="translate(${r2(hb.x + hb.w + 10)} ${r2(hb.y + hb.h + 40)})"><circle r="14" stroke-width=".8"/><path d="M0 -10 5 7 0 3-5 7z" fill="currentColor" stroke="none"/><text class="bp-note" y="-19">N</text></g>` +
  `<g transform="translate(${r2(hb.x)} ${r2(hb.y + hb.h + 40)})"><path d="M0 0h180M0-5v10M45-3v6M90-5v10M180-5v10" stroke-width=".8"/><text class="bp-note" x="0" y="18" text-anchor="start">0</text><text class="bp-note" x="90" y="18">25</text><text class="bp-note" x="180" y="18">50 FT</text></g>`;
const blueprint = `<svg id="plan" viewBox="${vb}" class="drawing hero-svg" fill="none" stroke="currentColor" aria-hidden="true"><g>${hByLayer.map(lineSvg).join('')}${extras}</g></svg>`;
const roads = hf.objects.filter((o) => o.kind === 'asset' && o.assetKey === 'road');
const lanesY = roads.filter((o) => o.rotation === 0).map((o) => r2(o.y));
const mainX = r2(roads.find((o) => o.rotation === 90)!.x);
const heroIds: Record<string, string> = { entrance: 'hr-entrance' };
const real = `<svg id="hr-real" viewBox="${vb}" class="hero-svg hero-real" role="img" aria-label="Floor 1 of a sample site as the app draws it. Click a space or a landmark to find it.">` +
  `<rect x="${r2(hb.x - pad)}" y="${r2(hb.y - pad - 40)}" width="${r2(hb.w + pad * 2)}" height="${r2(hb.h + pad * 2 + 70)}" fill="#e7e4dd"/>` +
  `<g id="hr-world" data-box="${r2(hb.x)} ${r2(hb.y)} ${r2(hb.w)} ${r2(hb.h)}" data-lanes="${lanesY.join(',')}" data-main="${mainX}">${hByLayer.map((o) => objectSvg(o, heroIds, true)).join('')}</g>` +
  `<path id="hr-route" d="M0 0" fill="none"/><rect id="hr-ring" fill="none" rx="5"/></svg>`;

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
put('HERO-PLAN', blueprint + real);
writeFileSync(p, html);
console.log(`demo ok: ${floor.objects.length} objects, ${total} library items`);
