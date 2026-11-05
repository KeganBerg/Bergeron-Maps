import { category } from '../defs';
import { along, customSign, hatched, raisedShadow, signCircle, signDiamond, signOctagon, signRect, signTriangle, zone } from '../draw';
import { glyph } from '../glyphs';
import { boxRect, F, FS, fitText, icon, P, r2, S, text, type DrawCtx } from '../style';

// ---------------------------------------------------------------- outdoor

const od = category('Outdoor environment');

/** Scalloped round canopy, like a tree seen from above on a site plan. */
const canopy = (lobes: number) => icon(64, 64, (c) => {
  const cx = 32, cy = 32;
  // Size the ring so the outer edge of every lobe, plus the drop shadow,
  // stays inside the 64 px box. Fewer lobes bulge further, so they get a
  // smaller ring; otherwise small trees are clipped flat on their sides.
  const half = Math.sin(Math.PI / lobes);
  const arc = 1.25; // lobe radius as a multiple of half the chord
  const bulge = half * (arc - Math.sqrt(arc * arc - 1));
  const R = (27.5 - c.sw / 2) / (Math.cos(Math.PI / lobes) + bulge);
  const lobeR = R * half * arc;
  let d = '';
  for (let i = 0; i <= lobes; i++) {
    const a = (i / lobes) * Math.PI * 2 - Math.PI / 2;
    const x = cx + Math.cos(a) * R, y = cy + Math.sin(a) * R;
    d += i === 0 ? `M${r2(x)} ${r2(y)}` : ` A${r2(lobeR)} ${r2(lobeR)} 0 0 1 ${r2(x)} ${r2(y)}`;
  }
  return `<path d="${d}Z" transform="translate(3 4)" fill="${P.shadow}"/><path d="${d}Z" ${FS(c)}/><circle cx="26" cy="25" r="11" fill="#fff" fill-opacity="0.16"/><path d="M32 32 22 22M32 32l11-7M32 32l-3 13M32 32l12 9" stroke="${P.foliageDark}" stroke-width="1.2" stroke-linecap="round"/><circle cx="32" cy="32" r="2.6" fill="${P.trunk}"/>`;
});

const speckle = (c: DrawCtx, color: string, step = 11, r = 1.4) => {
  let s = '';
  for (let x = step / 2; x < c.w; x += step) for (let y = step / 2; y < c.h; y += step) {
    const j = ((x * 31 + y * 17) % 7) - 3;
    s += `<circle cx="${r2(x + j)}" cy="${r2(y - j / 2)}" r="${r}" fill="${color}"/>`;
  }
  return s;
};

export const OUTDOOR = [
  od('tree', 'Tree', { draw: canopy(9), width: 56, height: 56, layer: 'landmarks', fill: P.foliage, stroke: P.foliageDark, strokeWidth: 1.2, keywords: ['landscaping', 'green', 'plant', 'shade tree'], labelPos: 'below' }),
  od('small-tree', 'Small tree', { draw: canopy(7), width: 36, height: 36, layer: 'landmarks', fill: P.foliageLight, stroke: P.foliageDark, strokeWidth: 1, keywords: ['ornamental', 'sapling'], labelPos: 'below' }),
  od('large-tree', 'Large tree', { draw: canopy(12), width: 90, height: 90, layer: 'landmarks', fill: P.foliageDark, stroke: '#356b2a', strokeWidth: 1.5, keywords: ['oak', 'mature', 'shade'], labelPos: 'below' }),
  od('shrub', 'Bush', {
    width: 26, height: 26, layer: 'landmarks', fill: '#7cb860', stroke: P.foliageDark, strokeWidth: 1, keywords: ['shrub', 'plant', 'landscaping'], labelPos: 'below',
    draw: icon(26, 26, (c) => `<path d="M13 2.5c3 0 4.5 2 6 3s4 2.5 4 6-1.5 4.5-2.5 6-2.5 5.5-7.5 5.5-6-3-7.5-4.5S2.5 15 2.5 11.5s3-4.5 4.5-6 3-3 6-3Z" transform="translate(1 1.5)" fill="${P.shadow}"/><path d="M13 2.5c3 0 4.5 2 6 3s4 2.5 4 6-1.5 4.5-2.5 6-2.5 5.5-7.5 5.5-6-3-7.5-4.5S2.5 15 2.5 11.5s3-4.5 4.5-6 3-3 6-3Z" ${FS(c)}/><circle cx="10" cy="10" r="3.5" fill="#fff" fill-opacity="0.15"/>`),
  }),
  od('hedge', 'Hedge', {
    width: 160, height: 22, layer: 'landmarks', fill: '#5f9f45', stroke: P.foliageDark, strokeWidth: 1, keywords: ['hedgerow', 'shrubs', 'screen'],
    draw: (c) => {
      const n = Math.max(2, Math.round(c.w / (c.h * 0.9)));
      const step = c.w / n;
      let d = `M0 ${r2(c.h / 2)}`;
      for (let i = 0; i < n; i++) d += ` a${r2(step / 2)} ${r2(c.h / 2 - 1)} 0 0 1 ${r2(step)} 0`;
      for (let i = 0; i < n; i++) d += ` a${r2(step / 2)} ${r2(c.h / 2 - 1)} 0 0 1 ${r2(-step)} 0`;
      return `<path d="${d}Z" transform="translate(1.5 2)" fill="${P.shadow}"/><path d="${d}Z" ${FS(c)}/>`;
    },
  }),
  od('grass-area', 'Grass area', {
    width: 200, height: 120, layer: 'structure', fill: P.grass, stroke: P.grassEdge, strokeWidth: 1.5, keywords: ['lawn', 'turf', 'green space'],
    draw: (c) => `${boxRect(c, 4)}${speckle(c, P.grassEdge, 16, 1)}`,
  }),
  od('planter', 'Landscaping bed', {
    width: 180, height: 50, layer: 'structure', fill: P.mulch, stroke: P.concreteEdge, strokeWidth: 3, keywords: ['planter', 'mulch', 'garden bed', 'island'],
    draw: (c) => `${boxRect(c, 4)}${along(c, 30, (x) => `<circle cx="${r2(x)}" cy="${r2(c.h / 2)}" r="${r2(Math.min(10, c.h * 0.3))}" fill="${P.foliage}" stroke="${P.foliageDark}" stroke-width="1"/>`)}`,
  }),
  od('flower-bed', 'Flower bed', {
    width: 160, height: 50, layer: 'structure', fill: '#8a6a4a', stroke: P.concreteEdge, strokeWidth: 3, keywords: ['flowers', 'garden', 'annuals'],
    draw: (c) => {
      const colors = ['#e86a8a', '#f2c230', '#f4f4f4', '#b05cc8'];
      let f = '';
      let i = 0;
      for (let x = 10; x < c.w - 6; x += 12) for (let y = 10; y < c.h - 6; y += 12) f += `<circle cx="${r2(x + (i % 2) * 4)}" cy="${r2(y)}" r="3" fill="${colors[i++ % 4]}" stroke="${P.foliageDark}" stroke-width="0.6"/>`;
      return `${boxRect(c, 4)}${f}`;
    },
  }),
  od('rock-bed', 'Rock bed', {
    width: 160, height: 50, layer: 'structure', fill: '#b7b2a7', stroke: P.concreteEdge, strokeWidth: 2, keywords: ['river rock', 'stones', 'xeriscape'],
    draw: (c) => `${boxRect(c, 4)}${speckle(c, '#8f897d', 9, 2.4)}`,
  }),
  od('drain-grate', 'Drainage grate', {
    width: 24, height: 24, layer: 'structure', fill: '#5a6068', stroke: P.ink, strokeWidth: 1, keywords: ['drain', 'grate', 'catch basin'],
    draw: icon(24, 24, (c) => `<rect x="2" y="2" width="20" height="20" rx="1" ${FS(c)}/>${[0, 1, 2, 3, 4].map((i) => `<rect x="${5 + i * 3.2}" y="5" width="1.6" height="14" fill="#1b1f24"/>`).join('')}`),
  }),
  od('storm-drain', 'Storm drain', {
    width: 44, height: 22, layer: 'structure', fill: P.concrete, stroke: P.ink, strokeWidth: 1, keywords: ['curb inlet', 'drain', 'sewer'],
    draw: icon(44, 22, (c) => `<rect x="1" y="1" width="42" height="12" ${FS(c)}/><rect x="6" y="11" width="32" height="3" fill="#1b1f24"/><rect x="12" y="14" width="20" height="7" fill="#5a6068" stroke="${P.ink}" stroke-width="0.8"/>${[0, 1, 2, 3].map((i) => `<rect x="${14.5 + i * 4.5}" y="15" width="1.6" height="5" fill="#1b1f24"/>`).join('')}`),
  }),
  od('sidewalk-curb', 'Sidewalk curb', {
    width: 240, height: 8, layer: 'structure', fill: '#e9e6df', stroke: P.concreteEdge, strokeWidth: 1, keywords: ['curb', 'edge'],
    draw: (c) => `${boxRect(c)}${along(c, 40, (x) => `<path d="M${r2(x)} 0 V${c.h}" stroke="${P.concreteEdge}" stroke-width="0.6"/>`, 20)}`,
  }),
  od('curb', 'Raised curb', {
    width: 160, height: 20, layer: 'structure', fill: '#e4e0d8', stroke: '#8f897d', strokeWidth: 1.5, keywords: ['curb', 'island', 'median', 'divider'],
    draw: (c) => `<rect x="1.5" y="2" width="${c.w - 1}" height="${c.h - 1}" rx="3" fill="${P.shadow}"/>${boxRect(c, 3)}<rect x="3" y="3" width="${c.w - 6}" height="${c.h - 6}" rx="2" fill="none" stroke="#fff" stroke-opacity="0.6"/>`,
  }),
  od('grass-divider', 'Grass divider', {
    width: 200, height: 30, layer: 'structure', fill: P.grass, stroke: P.concreteEdge, strokeWidth: 3, keywords: ['median', 'grass strip', 'island'],
    draw: (c) => `${boxRect(c, 4)}${speckle({ ...c, w: c.w, h: c.h }, P.grassEdge, 14, 1)}`,
  }),
  od('dirt-area', 'Dirt area', { width: 160, height: 100, layer: 'structure', fill: '#b9966b', stroke: '#8c6b4a', strokeWidth: 1.2, keywords: ['soil', 'unpaved', 'earth'], draw: (c) => `${boxRect(c, 6)}${speckle(c, '#8c6b4a', 13, 1.2)}` }),
  od('gravel-area', 'Gravel area', { width: 160, height: 100, layer: 'structure', fill: P.gravel, stroke: '#a89f8c', strokeWidth: 1.2, keywords: ['gravel lot', 'stone', 'unpaved'], draw: (c) => `${boxRect(c, 2)}${speckle(c, '#a39a88', 7, 1.1)}` }),
  od('retaining-wall', 'Retaining wall', {
    width: 200, height: 14, layer: 'structure', fill: '#a8a091', stroke: '#6f6758', strokeWidth: 1.2, keywords: ['block wall', 'stone wall', 'terrace'],
    draw: (c) => `${boxRect(c)}${along(c, 18, (x) => `<path d="M${r2(x)} 0 V${r2(c.h / 2)} M${r2(x + 9)} ${r2(c.h / 2)} V${c.h}" stroke="#6f6758" stroke-width="0.8"/>`, 9)}<path d="M0 ${r2(c.h / 2)} H${c.w}" stroke="#6f6758" stroke-width="0.8"/>`,
  }),
  od('light-pole', 'Light pole', {
    width: 34, height: 34, layer: 'landmarks', fill: '#fff3b0', stroke: P.ink, strokeWidth: 1, keywords: ['lamp', 'lighting', 'parking light'], labelPos: 'below',
    draw: icon(34, 34, (c) => `<circle cx="17" cy="17" r="15" fill="${c.fill}" fill-opacity="${Math.min(c.fo, 0.45)}"/><circle cx="17" cy="17" r="4.5" fill="${P.steel}" stroke="${P.ink}" stroke-width="1"/><path d="M17 17 H28" stroke="${P.steelDark}" stroke-width="2"/><rect x="25" y="13.5" width="7" height="7" rx="1.5" ${FS(c)}/><path d="M17 17 H6" stroke="${P.steelDark}" stroke-width="2"/><rect x="2" y="13.5" width="7" height="7" rx="1.5" ${FS(c)}/>`),
  }),
  od('streetlight', 'Streetlight', {
    width: 64, height: 24, layer: 'landmarks', fill: '#fff3b0', stroke: P.ink, strokeWidth: 1, keywords: ['street lamp', 'cobra head', 'road light'], labelPos: 'below',
    draw: icon(64, 24, (c) => `<ellipse cx="50" cy="12" rx="13" ry="11" fill="${c.fill}" fill-opacity="${Math.min(c.fo, 0.45)}"/><circle cx="7" cy="12" r="5" fill="${P.steel}" stroke="${P.ink}" stroke-width="1"/><path d="M7 12 H46" stroke="${P.steelDark}" stroke-width="2.4"/><rect x="44" y="8" width="14" height="8" rx="4" ${FS(c)}/>`),
  }),
  od('utility-pole', 'Utility pole', {
    width: 34, height: 34, layer: 'landmarks', fill: '#8a6748', stroke: P.ink, strokeWidth: 1, keywords: ['power pole', 'telephone pole', 'electric'], labelPos: 'below',
    draw: icon(34, 34, (c) => `<path d="M3 17 H31" stroke="#6b4f36" stroke-width="3"/><circle cx="5" cy="17" r="1.6" fill="${P.ink}"/><circle cx="29" cy="17" r="1.6" fill="${P.ink}"/><circle cx="18" cy="18.5" r="6" fill="${P.shadow}"/><circle cx="17" cy="17" r="6" ${FS(c)}/><circle cx="17" cy="17" r="2.5" fill="none" stroke="${P.ink}" stroke-opacity="0.4"/>`),
  }),
  od('electrical-box', 'Electrical box', {
    width: 30, height: 24, layer: 'landmarks', fill: '#6f8f6a', stroke: P.ink, strokeWidth: 1, keywords: ['transformer', 'pad mount', 'power'], labelPos: 'below',
    draw: icon(30, 24, (c) => `${raisedShadow(2, 2, 26, 20, 2)}<rect x="2" y="2" width="26" height="20" rx="2" ${FS(c)}/>${glyph('bolt', 15, 12, 12, P.safety)}`),
  }),
  od('utility-cabinet', 'Utility cabinet', {
    width: 30, height: 20, layer: 'landmarks', fill: '#a8b0ba', stroke: P.ink, strokeWidth: 1, keywords: ['telecom', 'controller', 'cabinet'], labelPos: 'below',
    draw: icon(30, 20, (c) => `${raisedShadow(2, 2, 26, 16, 1.5)}<rect x="2" y="2" width="26" height="16" rx="1.5" ${FS(c)}/><path d="M15 2 V18" stroke="${P.ink}" stroke-width="0.8"/><path d="M12.5 8v4M17.5 8v4" stroke="${P.ink}" stroke-width="1.2" stroke-linecap="round"/>`),
  }),
  od('water-feature', 'Water feature', {
    width: 80, height: 80, layer: 'landmarks', fill: P.water, stroke: '#a49c8c', strokeWidth: 4, keywords: ['fountain', 'basin'], labelPos: 'below',
    draw: icon(80, 80, (c) => `<circle cx="41.5" cy="42" r="36" fill="${P.shadow}"/><circle cx="40" cy="40" r="36" ${FS(c)}/>${[12, 20, 28].map((rr) => `<circle cx="40" cy="40" r="${rr}" fill="none" stroke="#fff" stroke-opacity="0.55" stroke-width="1"/>`).join('')}<circle cx="40" cy="40" r="6" fill="#d8d2c4" stroke="#a49c8c" stroke-width="1.5"/>`),
  }),
  od('pond', 'Pond', {
    width: 180, height: 120, layer: 'structure', fill: P.water, stroke: P.waterEdge, strokeWidth: 1.5, keywords: ['lake', 'retention pond', 'water'],
    draw: (c) => {
      const w = c.w, h = c.h;
      const d = `M${r2(w * 0.12)} ${r2(h * 0.45)} C${r2(w * 0.05)} ${r2(h * 0.15)} ${r2(w * 0.35)} ${r2(h * 0.02)} ${r2(w * 0.55)} ${r2(h * 0.1)} S${r2(w * 0.97)} ${r2(h * 0.2)} ${r2(w * 0.92)} ${r2(h * 0.55)} S${r2(w * 0.7)} ${r2(h * 0.98)} ${r2(w * 0.42)} ${r2(h * 0.92)} S${r2(w * 0.18)} ${r2(h * 0.75)} ${r2(w * 0.12)} ${r2(h * 0.45)}Z`;
      return `<path d="${d}" ${FS(c)}/><path d="M${r2(w * 0.35)} ${r2(h * 0.45)} q${r2(w * 0.05)} -4 ${r2(w * 0.1)} 0 t${r2(w * 0.1)} 0M${r2(w * 0.5)} ${r2(h * 0.62)} q${r2(w * 0.05)} -4 ${r2(w * 0.1)} 0 t${r2(w * 0.1)} 0" fill="none" stroke="#fff" stroke-opacity="0.6" stroke-width="1.2"/>`;
    },
  }),
  od('dumpster', 'Dumpster', {
    width: 64, height: 38, layer: 'landmarks', fill: '#3f7d5a', stroke: P.ink, strokeWidth: 1.2, keywords: ['trash', 'garbage', 'waste', 'bin', 'refuse'], labelPos: 'below',
    draw: icon(64, 38, (c) => `${raisedShadow(3, 3, 58, 32, 2, 2)}<rect x="3" y="3" width="58" height="32" rx="2" ${FS(c)}/><rect x="6" y="6" width="25" height="26" rx="1" fill="#000" fill-opacity="0.12"/><rect x="33" y="6" width="25" height="26" rx="1" fill="#000" fill-opacity="0.12"/><path d="M6 19h25M33 19h25" stroke="${P.ink}" stroke-opacity="0.4"/>`),
  }),
  od('trash', 'Trash can', {
    width: 20, height: 20, layer: 'landmarks', fill: '#6e7782', stroke: P.ink, strokeWidth: 1, keywords: ['garbage', 'bin', 'waste', 'litter'], labelPos: 'below',
    draw: icon(20, 20, (c) => `<circle cx="11" cy="11.2" r="8" fill="${P.shadow}"/><circle cx="10" cy="10" r="8" ${FS(c)}/><circle cx="10" cy="10" r="5" fill="#000" fill-opacity="0.25"/>`),
  }),
  od('flagpole', 'Flagpole', {
    width: 40, height: 30, layer: 'landmarks', fill: '#c8102e', stroke: P.ink, strokeWidth: 0.8, keywords: ['flag', 'pole'], labelPos: 'below',
    draw: icon(40, 30, (c) => `<circle cx="8" cy="15" r="6" fill="${P.concrete}" stroke="${P.concreteEdge}"/><circle cx="8" cy="15" r="2.2" fill="${P.steelDark}"/><path d="M10 13 C18 9 24 17 36 12 V20 C24 25 18 17 10 21Z" ${FS(c)}/>`),
  }),
  od('monument-sign', 'Dealership monument sign', {
    width: 110, height: 34, layer: 'landmarks', fill: '#1f3a5f', stroke: P.ink, strokeWidth: 1, keywords: ['monument', 'entry sign', 'dealer sign', 'brand'], label: 'DEALERSHIP', labelPos: 'inside',
    draw: icon(110, 34, (c) => `<rect x="2" y="18" width="106" height="14" rx="1" fill="#b4ab9a" stroke="#857c6a" stroke-width="1"/>${raisedShadow(8, 2, 94, 20, 2)}<rect x="8" y="2" width="94" height="20" rx="2" ${FS(c)}/>${text(55, 12.5, fitText(86, (c.label || 'DEALERSHIP').length, 11), (c.label || 'DEALERSHIP').toUpperCase(), '#fff')}`),
  }),
  od('promo-banner', 'Promotional banner', {
    width: 110, height: 26, layer: 'landmarks', fill: '#d23a32', stroke: P.ink, strokeWidth: 0.8, keywords: ['banner', 'sale', 'flag', 'promotion', 'feather flag'], label: 'SALE', labelPos: 'inside',
    draw: icon(110, 26, (c) => `<circle cx="5" cy="13" r="3.5" fill="${P.steelDark}"/><circle cx="105" cy="13" r="3.5" fill="${P.steelDark}"/><path d="M8 4 H102 L98 13 L102 22 H8 L12 13 Z" ${FS(c)}/>${text(55, 13.5, fitText(80, (c.label || 'SALE').length, 12), (c.label || 'SALE').toUpperCase(), '#fff')}`),
  }),
  od('logo-sign', 'Brand logo sign', {
    width: 56, height: 56, layer: 'landmarks', fill: '#1f3a5f', stroke: P.ink, strokeWidth: 1, keywords: ['logo', 'pylon', 'brand', 'emblem'], label: 'LOGO', labelPos: 'inside',
    draw: icon(56, 56, (c) => `<rect x="22" y="44" width="12" height="10" fill="${P.steelDark}"/><circle cx="29.5" cy="25.5" r="23" fill="${P.shadow}"/><circle cx="28" cy="24" r="23" ${FS(c)}/><circle cx="28" cy="24" r="17" fill="#fff"/>${text(28, 24.5, fitText(28, (c.label || 'LOGO').length, 12), (c.label || 'LOGO').toUpperCase(), c.fill)}`),
  }),
  od('tire-storage', 'Tire storage area', {
    width: 160, height: 70, layer: 'structure', fill: '#d9d6cf', stroke: P.inkSoft, strokeWidth: 1.5, keywords: ['tires', 'tire rack', 'wheels'], label: 'Tires', labelPos: 'center',
    draw: (c) => {
      let t = '';
      for (let x = 12; x < c.w - 8; x += 18) for (let y = 12; y < c.h - 8; y += 18) t += `<circle cx="${x}" cy="${y}" r="7.5" fill="#2b2f35"/><circle cx="${x}" cy="${y}" r="3.2" fill="${P.steel}"/>`;
      return `${boxRect(c, 2)}${t}`;
    },
  }),
];

// ---------------------------------------------------------------- signs & safety

const sg = category('Signs and safety');
const SIGN = { layer: 'labels' as const, width: 40, height: 46, strokeWidth: 1.2, labelPos: 'below' as const };
const rect = (key: string, name: string, bg: string, fg: string, lines: string[], g?: string, keywords: string[] = [], border?: string) =>
  sg(key, name, { ...SIGN, draw: signRect({ bg, fg, lines, glyph: g, border }), fill: bg, stroke: P.ink, keywords: ['sign', ...keywords] });

const markingNumber: (c: DrawCtx, fallback: string) => string = (c, fallback) => c.label || fallback;

export const SIGNS = [
  sg('stop-sign', 'Stop sign', { ...SIGN, draw: signOctagon('STOP'), fill: P.danger, stroke: '#ffffff', strokeWidth: 1.5, keywords: ['stop', 'traffic', 'sign'] }),
  sg('yield-sign', 'Yield sign', { ...SIGN, draw: signTriangle({ word: 'YIELD', down: true }), fill: P.danger, stroke: '#ffffff', strokeWidth: 1, keywords: ['give way', 'sign'] }),
  sg('speed-limit-sign', 'Speed limit sign', {
    ...SIGN, fill: '#ffffff', stroke: P.ink, keywords: ['speed', 'mph', 'limit', 'sign'], label: '5', labelPos: 'inside',
    draw: icon(56, 64, (c) => `<rect x="17" y="48" width="3" height="14" fill="${P.steelDark}" transform="translate(9 0)"/><rect x="9" y="3.5" width="40" height="46" rx="4" fill="${P.shadow}"/><rect x="8" y="2" width="40" height="46" rx="4" ${FS(c)}/><rect x="11" y="5" width="34" height="40" rx="2.5" fill="none" stroke="${P.ink}" stroke-width="1.4"/>${text(28, 12, 6.5, 'SPEED', P.ink)}${text(28, 19, 6.5, 'LIMIT', P.ink)}${text(28, 34, fitText(30, markingNumber(c, '5').length, 18), markingNumber(c, '5'), P.ink)}`),
  }),
  sg('one-way-sign', 'One-way sign', {
    ...SIGN, width: 60, height: 34, fill: '#111827', stroke: '#ffffff', keywords: ['one way', 'sign', 'direction'],
    draw: icon(70, 40, (c) => `<rect x="3" y="4" width="66" height="30" rx="3" fill="${P.shadow}"/><rect x="2" y="2" width="66" height="30" rx="3" ${F(c)} ${S(c)}/><path d="M8 13.5 H44 V8 L62 17 L44 26 V20.5 H8 Z" fill="#fff"/>${text(26, 17.3, 6.5, 'ONE WAY', '#111827')}<rect x="33.5" y="32" width="3" height="8" fill="${P.steelDark}"/>`),
  }),
  sg('no-entry-sign', 'No-entry sign', { ...SIGN, draw: signCircle({ glyph: 'noEntry', fg: '#ffffff' }), fill: P.danger, stroke: '#ffffff', keywords: ['do not enter', 'wrong way', 'sign'] }),
  sg('no-parking', 'No-parking sign', { ...SIGN, draw: signCircle({ word: 'P', fg: P.ink, ring: P.danger, slash: true }), fill: '#ffffff', stroke: P.ink, keywords: ['no parking', 'tow', 'restricted', 'sign'] }),
  rect('reserved-sign', 'Reserved parking sign', '#ffffff', P.go, ['RESERVED', 'PARKING'], undefined, ['reserved'], P.go),
  rect('accessible', 'Accessible parking sign', P.accessible, '#ffffff', ['RESERVED'], 'wheelchair', ['ada', 'handicap', 'disabled', 'wheelchair', 'accessible']),
  rect('exit-sign', 'Exit sign', P.go, '#ffffff', ['EXIT'], 'right', ['exit', 'out']),
  rect('entrance-sign', 'Entrance sign', P.go, '#ffffff', ['ENTRANCE'], 'left', ['entrance', 'in']),
  rect('directional-sign', 'Directional sign', P.go, '#ffffff', ['THIS WAY'], 'right', ['wayfinding', 'guide', 'arrow']),
  sg('ped-crossing-sign', 'Pedestrian crossing sign', { ...SIGN, draw: signDiamond('walk', P.ink), fill: '#c6d93a', stroke: P.ink, keywords: ['crosswalk', 'pedestrian', 'sign'] }),
  sg('caution-sign', 'Caution sign', { ...SIGN, draw: signDiamond('alert', P.ink), fill: P.safety, stroke: P.ink, keywords: ['warning', 'hazard', 'sign'] }),
  rect('road-closed-sign', 'Road closed sign', '#ffffff', P.ink, ['ROAD', 'CLOSED'], undefined, ['closed', 'barricade'], P.ink),
  rect('restricted-sign', 'Restricted-access sign', P.danger, '#ffffff', ['AUTHORIZED', 'ONLY'], 'lock', ['restricted', 'staff only', 'private']),
  sg('height-sign', 'Height restriction sign', {
    ...SIGN, fill: P.safety, stroke: P.ink, keywords: ['clearance', 'low clearance', 'max height', 'sign'], label: "7'-0\"", labelPos: 'inside',
    draw: icon(56, 64, (c) => `${'<rect x="26.5" y="49" width="3" height="13" fill="#6e7782"/>'}<polygon points="28 3 51 26 28 49 5 26" transform="translate(1 1.5)" fill="${P.shadow}"/><polygon points="28 3 51 26 28 49 5 26" ${FS(c)}/><path d="M28 9v6M24 12l4-4 4 4M28 43v-6M24 40l4 4 4-4" fill="none" stroke="${P.ink}" stroke-width="1.6"/>${text(28, 26, fitText(30, (c.label || "7'-0\"").length, 11), c.label || "7'-0\"", P.ink)}`),
  }),
  sg('clearance-bar', 'Clearance-height marker', {
    layer: 'labels', width: 200, height: 18, fill: P.safety, stroke: P.ink, strokeWidth: 1, keywords: ['clearance bar', 'headache bar', 'height', 'overhead'], label: "CLEARANCE 7'-0\"", labelPos: 'inside',
    draw: (c) => {
      const id = `cb${Math.round(c.w)}`;
      const t = c.label || "CLEARANCE 7'-0\"";
      const tw = Math.min(c.w * 0.7, t.length * c.h * 0.42);
      return `<defs><pattern id="${id}" width="16" height="16" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="8" height="16" fill="${P.ink}"/></pattern></defs>${boxRect(c, 2)}<rect x="${c.sw / 2}" y="${c.sw / 2}" width="${c.w - c.sw}" height="${c.h - c.sw}" rx="2" fill="url(#${id})"/><rect x="${r2(c.w / 2 - tw / 2)}" y="2" width="${r2(tw)}" height="${c.h - 4}" fill="${c.fill}"/>${text(c.w / 2, c.h / 2, Math.min(c.h * 0.55, fitText(tw, t.length, 12)), t, P.ink)}`;
    },
  }),
  sg('fire-lane', 'Fire lane marking', { layer: 'structure', width: 240, height: 40, fill: '#fde8e6', stroke: P.danger, strokeWidth: 2, keywords: ['fire', 'no parking', 'emergency', 'red curb'], draw: hatched(P.danger, 'FIRE LANE') }),
  sg('keep-clear', 'Keep-clear marking', { layer: 'structure', width: 160, height: 60, fill: '#fff6d6', stroke: '#b88a00', strokeWidth: 2, keywords: ['do not block', 'keep clear', 'box'], draw: hatched(P.paintYellow, 'KEEP CLEAR', P.ink) }),
  sg('hazard-marking', 'Hazard marking', { layer: 'structure', width: 140, height: 40, fill: P.safety, stroke: P.ink, strokeWidth: 1.5, keywords: ['caution stripes', 'yellow black', 'danger'], draw: hatched(P.ink) }),
  sg('construction-zone', 'Construction-zone marking', {
    layer: 'structure', width: 220, height: 130, fill: P.orange, fillOpacity: 0.16, stroke: P.orange, strokeWidth: 2.5, keywords: ['construction', 'work zone', 'cones'], label: 'Construction', labelPos: 'badge',
    draw: zone({ glyph: 'cone', hatch: 'rgba(234,122,26,0.25)' }),
  }),
  rect('customer-parking-sign', 'Customer parking sign', P.info, '#ffffff', ['CUSTOMER', 'PARKING'], 'car', ['customer', 'guest']),
  rect('employee-parking-sign', 'Employee parking sign', '#4b5563', '#ffffff', ['EMPLOYEE', 'PARKING'], 'person', ['staff', 'employee']),
  rect('new-inventory-sign', 'New inventory sign', '#ffffff', P.info, ['NEW', 'INVENTORY'], 'star', ['new cars', 'inventory'], P.info),
  rect('used-inventory-sign', 'Used inventory sign', '#ffffff', P.inkSoft, ['USED', 'INVENTORY'], 'car', ['pre-owned', 'used cars'], P.inkSoft),
  rect('cpo-sign', 'Certified pre-owned sign', '#1f3a5f', '#ffffff', ['CERTIFIED', 'PRE-OWNED'], 'shield', ['cpo', 'certified']),
  rect('service-sign', 'Service department sign', P.orange, '#ffffff', ['SERVICE'], 'wrench', ['service']),
  rect('parts-sign', 'Parts department sign', '#8a5a2b', '#ffffff', ['PARTS'], 'box', ['parts']),
  rect('delivery-sign', 'Vehicle delivery sign', P.go, '#ffffff', ['VEHICLE', 'DELIVERY'], 'key', ['delivery', 'sold']),
  rect('pickup-sign', 'Customer pickup sign', P.teal, '#ffffff', ['CUSTOMER', 'PICKUP'], 'carIn', ['pickup', 'valet']),
  rect('showroom-sign', 'Showroom sign', '#1f3a5f', '#ffffff', ['SHOWROOM'], 'showroom', ['showroom', 'sales']),
  sg('fire-extinguisher', 'Fire extinguisher', {
    layer: 'landmarks', width: 22, height: 30, fill: P.danger, stroke: P.ink, strokeWidth: 1, keywords: ['extinguisher', 'fire', 'safety'], labelPos: 'below',
    draw: icon(22, 30, (c) => `<rect x="2" y="2" width="18" height="26" rx="2" fill="#fff" stroke="${P.danger}" stroke-width="1.2"/><rect x="7" y="9" width="8" height="17" rx="3" ${FS(c)}/><path d="M11 9V6.5M8 6.5h6M14 6.5l3 2" stroke="${P.ink}" stroke-width="1.2" fill="none"/>`),
  }),
  sg('hydrant', 'Fire hydrant', {
    layer: 'landmarks', width: 26, height: 26, fill: P.danger, stroke: P.ink, strokeWidth: 1, keywords: ['hydrant', 'fire', 'water', 'fdc'], labelPos: 'below',
    draw: icon(26, 26, (c) => `<circle cx="14" cy="14.5" r="8" fill="${P.shadow}"/><rect x="2" y="10.5" width="22" height="5" rx="1.5" ${FS(c)}/><rect x="10.5" y="2" width="5" height="22" rx="1.5" ${FS(c)}/><circle cx="13" cy="13" r="7.5" ${FS(c)}/><circle cx="13" cy="13" r="3.2" fill="${P.safety}" stroke="${P.ink}" stroke-width="0.8"/>`),
  }),
  sg('emergency-exit', 'Emergency exit', { ...SIGN, draw: signRect({ bg: P.go, fg: '#ffffff', lines: ['EMERGENCY', 'EXIT'], glyph: 'run' }), fill: P.go, stroke: P.ink, keywords: ['egress', 'emergency', 'exit'] }),
  sg('fire-exit', 'Fire exit', { ...SIGN, draw: signRect({ bg: P.danger, fg: '#ffffff', lines: ['FIRE', 'EXIT'], glyph: 'run' }), fill: P.danger, stroke: P.ink, keywords: ['egress', 'fire', 'exit'] }),
  sg('security-camera', 'Security camera', {
    layer: 'landmarks', width: 60, height: 44, fill: '#f2f4f7', stroke: P.ink, strokeWidth: 1, keywords: ['cctv', 'camera', 'surveillance'], labelPos: 'below',
    draw: icon(60, 44, (c) => `<path d="M10 22 L58 4 V40 Z" fill="${P.info}" fill-opacity="0.12" stroke="${P.info}" stroke-opacity="0.5" stroke-width="0.8" stroke-dasharray="3 2"/><circle cx="11" cy="23.5" r="9" fill="${P.shadow}"/><circle cx="10" cy="22" r="9" ${FS(c)}/><circle cx="10" cy="22" r="5" fill="#1b1f24"/><circle cx="11.5" cy="20.5" r="1.4" fill="#fff" fill-opacity="0.7"/>`),
  }),
  sg('electrical-room-sign', 'Electrical room', { ...SIGN, draw: signTriangle({ glyph: 'bolt' }), fill: P.safety, stroke: P.ink, keywords: ['electrical', 'high voltage', 'danger'] }),
  sg('sign', 'Custom sign', { ...SIGN, also: ['Custom and reusable'], draw: customSign, fill: P.info, stroke: P.ink, label: 'YOUR TEXT', labelPos: 'inside', keywords: ['custom', 'sign', 'notice', 'information'] }),
];

