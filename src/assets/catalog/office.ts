/**
 * Offices and interiors: what people lay out inside a building's floor plan.
 * Everything is drawn from above at real size (5 map px = 1 ft), in the same
 * cartoon-realistic style as the rest of the library. Items the general
 * library already has (reception desk, restrooms, stairs, elevators, break
 * room...) are listed here through OFFICE_SHARED instead of being redrawn.
 */
import { category, type AssetCategory } from '../defs';
import { along, raisedShadow, room, zone } from '../draw';
import { boxRect, F, FS, icon, P, r2, S, shade, type DrawCtx, type DrawFn } from '../style';

export const OFFICE: AssetCategory = 'Offices and interiors';
const of = category(OFFICE);

/** Office materials, kept together so every desk, chair and screen matches. */
const M = {
  laminate: '#d2b48c',
  laminateEdge: '#a8845a',
  walnut: '#8a6040',
  fabric: '#46566b',
  fabricLight: '#64758b',
  partition: '#a9b4bf',
  carpet: '#e7e3da',
  screen: '#2c3440',
  glow: '#8fb4d6',
  key: '#cfd5dc',
  white: '#ffffff',
  leaf: P.foliage,
};

/** General assets that are also office items, with office words added to search. */
export const OFFICE_SHARED: Record<string, string[]> = {
  'reception-desk': ['front desk', 'office reception'],
  'reception-area': ['office reception', 'front office'],
  lobby: ['office lobby'],
  'break-room': ['office kitchen', 'lunch room'],
  'admin-office': ['back office', 'accounting'],
  'sales-office': ['manager office'],
  'finance-office': ['business office'],
  'security-desk': ['office security'],
  'info-desk': ['help desk'],
  restroom: ['office bathroom'],
  'restroom-men': ['office bathroom'],
  'restroom-women': ['office bathroom'],
  'restroom-accessible': ['office bathroom'],
  'storage-room': ['supply closet', 'office storage'],
  'utility-room': ['electrical closet', 'it closet'],
  stairs: ['office stairs'],
  stairwell: ['office stairs'],
  elevator: ['office elevator'],
  'elevator-lobby': ['office elevator'],
  wall: ['office wall'],
  'key-box': ['key cabinet', 'key safe'],
  'fire-extinguisher': ['office safety'],
  aed: ['office safety'],
  'first-aid': ['office safety'],
  'exit-sign': ['office safety'],
  trash: ['waste basket', 'office trash'],
  'security-camera': ['office camera'],
};

// ---------------------------------------------------------------- pieces shared by several drawings

const shadow = (x: number, y: number, w: number, h: number, rx = 1) => raisedShadow(x, y, w, h, rx, 1.2);

/** Office chair from above: seat, a backrest toward `back`, and two armrests. */
function chair(cx: number, cy: number, s: number, rot = 0, color = M.fabric): string {
  const h = s / 2;
  return `<g transform="translate(${r2(cx)} ${r2(cy)}) rotate(${rot})"><circle cx="${r2(s * 0.08)}" cy="${r2(s * 0.1)}" r="${r2(h * 0.95)}" fill="${P.shadow}"/><rect x="${r2(-h * 0.82)}" y="${r2(-h * 0.7)}" width="${r2(s * 0.82)}" height="${r2(s * 0.82)}" rx="${r2(s * 0.22)}" fill="${color}" stroke="${P.ink}" stroke-width="${r2(Math.max(0.4, s * 0.05))}"/><path d="M${r2(-h * 0.85)} ${r2(h * 0.62)} Q0 ${r2(h * 1.05)} ${r2(h * 0.85)} ${r2(h * 0.62)}" fill="none" stroke="${P.ink}" stroke-width="${r2(s * 0.16)}" stroke-linecap="round"/><path d="M${r2(-h * 0.92)} ${r2(-h * 0.35)} v${r2(s * 0.42)} M${r2(h * 0.92)} ${r2(-h * 0.35)} v${r2(s * 0.42)}" stroke="${shade(color, 0.35)}" stroke-width="${r2(s * 0.1)}" stroke-linecap="round"/></g>`;
}

/** Flat monitor on a stand with a keyboard in front of it, facing down (toward +y). */
function computer(cx: number, y: number, w: number, dual = false): string {
  const mw = dual ? w * 0.46 : w * 0.72;
  const screens = dual ? [cx - mw / 2 - w * 0.02, cx + mw / 2 + w * 0.02] : [cx];
  const t = Math.max(1.2, w * 0.1);
  const mon = screens
    .map((x) => `<rect x="${r2(x - mw / 2)}" y="${r2(y)}" width="${r2(mw)}" height="${r2(t)}" rx="${r2(t * 0.3)}" fill="${M.screen}"/><rect x="${r2(x - mw * 0.12)}" y="${r2(y + t)}" width="${r2(mw * 0.24)}" height="${r2(t * 0.6)}" fill="${P.steelDark}"/>`)
    .join('');
  const kw = w * 0.56;
  const ky = y + t * 2.2;
  return `${mon}<rect x="${r2(cx - kw / 2)}" y="${r2(ky)}" width="${r2(kw)}" height="${r2(t * 1.1)}" rx="${r2(t * 0.2)}" fill="${M.key}" stroke="${P.inkSoft}" stroke-width="0.3"/><ellipse cx="${r2(cx + kw / 2 + t * 1.1)}" cy="${r2(ky + t * 0.55)}" rx="${r2(t * 0.35)}" ry="${r2(t * 0.5)}" fill="${M.key}" stroke="${P.inkSoft}" stroke-width="0.3"/>`;
}

/** Desk top, the main restylable surface. */
const deskTop = (c: DrawCtx, x: number, y: number, w: number, h: number, rx = 1) =>
  `${shadow(x, y, w, h, rx)}<rect x="${r2(x)}" y="${r2(y)}" width="${r2(w)}" height="${r2(h)}" rx="${rx}" ${FS(c)}/>`;

/**
 * One cubicle, 40 × 40 units, open at the bottom: fabric partitions on three
 * sides, an L-shaped work surface, a computer and a chair.
 */
function cube(c: DrawCtx): string {
  const pw = 2; // partition thickness
  const wall = `fill="${M.partition}" ${S(c)}`;
  return `<rect x="0" y="0" width="40" height="40" fill="${M.carpet}" fill-opacity="${c.fo}"/>`
    + `<path d="M0 0H40V30H38V2H2V30H0Z" ${wall}/>`
    + `<path d="M${pw} ${pw}H38V12H14V30H${pw}Z" fill="${M.laminate}" stroke="${M.laminateEdge}" stroke-width="0.6"/>`
    + computer(25, 3.2, 14)
    + chair(23, 20, 9, 0)
    + `<rect x="4" y="22" width="7" height="6" rx="0.6" fill="${P.steel}" stroke="${P.ink}" stroke-width="0.4"/><path d="M5 25h5" stroke="${P.ink}" stroke-width="0.4"/>`;
}

/** Repeats a fixed design `cell` units wide across a stretched width without squashing it. */
function repeatCells(c: DrawCtx, cellW: number, cellH: number, body: (i: number) => string, rows = 1): string {
  const k = c.h / (cellH * rows);
  const n = Math.max(1, Math.round(c.w / (cellW * k)));
  const sx = c.w / (n * cellW);
  let out = '';
  for (let r = 0; r < rows; r++)
    for (let i = 0; i < n; i++) {
      const flip = rows === 2 && r === 0 ? ` translate(0 ${cellH}) scale(1 -1)` : '';
      out += `<g transform="translate(${r2(i * cellW * sx)} ${r2(r * cellH * k)}) scale(${r2(sx)} ${r2(k)})${flip}">${body(i)}</g>`;
    }
  return out;
}

const plantTop = (cx: number, cy: number, r: number) =>
  `<circle cx="${r2(cx + r * 0.12)}" cy="${r2(cy + r * 0.15)}" r="${r2(r)}" fill="${P.shadow}"/><circle cx="${r2(cx)}" cy="${r2(cy)}" r="${r2(r * 0.82)}" fill="#b0714a" stroke="${P.ink}" stroke-width="${r2(r * 0.08)}"/>`
  + [0, 72, 144, 216, 288].map((a) => {
    const t = (a * Math.PI) / 180;
    return `<ellipse cx="${r2(cx + Math.cos(t) * r * 0.42)}" cy="${r2(cy + Math.sin(t) * r * 0.42)}" rx="${r2(r * 0.5)}" ry="${r2(r * 0.3)}" transform="rotate(${a} ${r2(cx + Math.cos(t) * r * 0.42)} ${r2(cy + Math.sin(t) * r * 0.42)})" fill="${a % 144 === 0 ? P.foliageDark : P.foliage}" stroke="${P.foliageDark}" stroke-width="${r2(r * 0.05)}"/>`;
  }).join('')
  + `<circle cx="${r2(cx)}" cy="${r2(cy)}" r="${r2(r * 0.22)}" fill="${P.foliageLight}"/>`;

// ---------------------------------------------------------------- walls, doors and windows

/** The building's outside walls, with the main door gap at the bottom. */
const outerWalls: DrawFn = (c) => {
  const i = c.sw / 2;
  const dw = Math.min(30, c.w * 0.2);
  const dx = c.w / 2 - dw / 2;
  const gap = c.sw > 0
    ? `<rect x="${r2(dx)}" y="${r2(c.h - c.sw - 0.5)}" width="${r2(dw)}" height="${r2(c.sw + 1)}" fill="${c.fill}"/><path d="M${r2(dx)} ${r2(c.h - i)} h${r2(dw)}" stroke="${P.glassDark}" stroke-width="${r2(Math.max(1, c.sw * 0.35))}"/><path d="M${r2(dx)} ${r2(c.h - i)} a${r2(dw / 2)} ${r2(dw / 2)} 0 0 0 ${r2(dw / 2)} ${r2(dw / 2)} M${r2(dx + dw)} ${r2(c.h - i)} a${r2(dw / 2)} ${r2(dw / 2)} 0 0 1 ${r2(-dw / 2)} ${r2(dw / 2)}" fill="none" stroke="${P.inkSoft}" stroke-width="0.8" stroke-dasharray="2 2"/>`
    : '';
  return `<rect x="${r2(i)}" y="${r2(i)}" width="${r2(c.w - c.sw)}" height="${r2(c.h - c.sw)}" ${FS(c)}/>${gap}`;
};

/** A door leaf with its swing, in a 36 × 36 box, hinged at the bottom left. */
const door = (double: boolean): DrawFn => icon(double ? 72 : 36, 36, (c) => {
  const leaf = (x: number, dir: 1 | -1) => {
    const hx = x;
    return `<rect x="${r2(dir === 1 ? hx : hx - 2.5)}" y="2" width="2.5" height="32" ${FS(c)}/><path d="M${r2(hx)} 2 A32 32 0 0 ${dir === 1 ? 1 : 0} ${r2(hx + dir * 32)} 34" fill="none" stroke="${P.inkSoft}" stroke-width="1" stroke-dasharray="3 2"/>`;
  };
  const sill = `<rect x="0" y="33" width="${double ? 72 : 36}" height="3" fill="${P.room}" stroke="${P.inkSoft}" stroke-width="0.6"/>`;
  return sill + (double ? leaf(2, 1) + leaf(70, -1) : leaf(2, 1));
});

// ---------------------------------------------------------------- the catalog

const ROOM = { layer: 'structure' as const, fill: P.room, stroke: P.wall, strokeWidth: 2, labelPos: 'badge' as const };
const rm = (key: string, name: string, label: string, g: string, color: string, w: number, h: number, keywords: string[] = []) =>
  of(key, name, { ...ROOM, width: w, height: h, draw: room(g, color), label, keywords: ['room', 'office', ...keywords] });
const FURN = { layer: 'landmarks' as const, labelPos: 'below' as const };

export const OFFICES = [
  of('outer-walls', 'Outer walls', {
    width: 600, height: 400, layer: 'structure', fill: P.room, stroke: P.wall, strokeWidth: 6, keywords: ['exterior walls', 'building shell', 'perimeter', 'floor plan', 'footprint'],
    draw: outerWalls,
  }),
  of('interior-wall', 'Interior wall', {
    width: 200, height: 4, layer: 'structure', fill: P.wall, stroke: shade(P.wall, 0.3), strokeWidth: 0, keywords: ['partition', 'drywall', 'divider'],
    draw: (c) => boxRect(c),
  }),
  of('glass-wall', 'Glass wall', {
    width: 200, height: 4, layer: 'structure', fill: P.glass, stroke: P.glassDark, strokeWidth: 1, keywords: ['glass partition', 'storefront', 'window wall'],
    draw: (c) => `${boxRect(c)}${along(c, 40, (x) => `<rect x="${r2(x - 1)}" y="0" width="2" height="${r2(c.h)}" fill="${P.glassDark}"/>`, 0)}`,
  }),
  of('window', 'Window', {
    width: 40, height: 5, layer: 'structure', fill: P.glass, stroke: P.wall, strokeWidth: 1, keywords: ['glazing', 'pane'],
    draw: (c) => `${boxRect(c)}<path d="M0 ${r2(c.h / 2)} H${r2(c.w)}" stroke="${P.glassDark}" stroke-width="0.6"/>`,
  }),
  of('door', 'Door', { ...FURN, layer: 'structure', draw: door(false), width: 18, height: 18, fill: M.white, stroke: P.ink, strokeWidth: 0.8, keywords: ['office door', 'swing door', 'entry'] }),
  of('double-door', 'Double door', { ...FURN, layer: 'structure', draw: door(true), width: 36, height: 18, fill: M.white, stroke: P.ink, strokeWidth: 0.8, keywords: ['double doors', 'main door', 'french doors'] }),

  rm('private-office', 'Private office', 'Office', 'briefcase', P.inkSoft, 70, 60, ['manager', 'executive', 'closed office']),
  rm('conference-room', 'Conference room', 'Conference', 'meet', P.info, 120, 80, ['meeting room', 'boardroom']),
  rm('huddle-room', 'Huddle room', 'Huddle', 'meet', P.teal, 60, 50, ['small meeting room', 'focus room']),
  rm('training-room', 'Training room', 'Training', 'chalkboard', P.violet, 140, 100, ['classroom', 'seminar']),
  rm('copy-room', 'Copy and print room', 'Copy room', 'layers', P.inkSoft, 60, 50, ['print room', 'copier', 'printer']),
  rm('server-room', 'Server room', 'Server room', 'grid', P.info, 60, 50, ['it room', 'data closet', 'network']),
  rm('mail-room', 'Mail room', 'Mail room', 'box', '#8a5a2b', 60, 50, ['mail', 'shipping', 'packages']),
  rm('kitchenette', 'Kitchenette', 'Kitchen', 'coffee', P.teal, 80, 50, ['kitchen', 'pantry', 'coffee bar']),
  rm('wellness-room', 'Wellness room', 'Wellness', 'heart', '#b03a72', 50, 50, ['mothers room', 'quiet room', 'nursing']),
  of('open-office', 'Open office area', {
    width: 240, height: 160, layer: 'structure', fill: P.info, stroke: P.info, fillOpacity: 0.1, strokeWidth: 1.5, dashed: true, labelPos: 'badge', label: 'Open office',
    keywords: ['open plan', 'bullpen', 'workspace', 'area', 'zone'], draw: zone({ glyph: 'desk' }),
  }),

  of('cubicle', 'Cubicle', {
    ...FURN, width: 40, height: 40, fill: M.carpet, stroke: shade(M.partition, 0.35), strokeWidth: 0.6, keywords: ['cube', 'workstation', 'pod', 'desk'],
    draw: icon(40, 40, cube),
  }),
  of('cubicle-cluster', 'Cubicle cluster (4)', {
    ...FURN, width: 80, height: 80, fill: M.carpet, stroke: shade(M.partition, 0.35), strokeWidth: 0.6, keywords: ['cubes', 'pod', 'workstations', 'quad', 'cluster'],
    draw: icon(80, 80, (c) => [[0, 0, 1, 1], [80, 0, -1, 1], [0, 80, 1, -1], [80, 80, -1, -1]].map(([x, y, sx, sy]) => `<g transform="translate(${x} ${y}) scale(${sx} ${sy})">${cube(c)}</g>`).join('')),
  }),
  of('cubicle-row', 'Cubicle row', {
    ...FURN, width: 160, height: 80, fill: M.carpet, stroke: shade(M.partition, 0.35), strokeWidth: 0.6, keywords: ['cubes', 'bank', 'row of cubicles', 'workstations'],
    note: 'Stretch it longer and more cubicles are added, back to back.',
    draw: (c) => repeatCells(c, 40, 40, () => cube(c), 2),
  }),
  of('desk', 'Desk', {
    ...FURN, width: 30, height: 15, fill: M.laminate, stroke: M.laminateEdge, strokeWidth: 0.8, keywords: ['table', 'work surface', 'writing desk'],
    draw: (c) => deskTop(c, c.sw / 2, c.sw / 2, c.w - c.sw, c.h - c.sw, 1),
  }),
  of('workstation', 'Desk with computer and chair', {
    ...FURN, width: 30, height: 26, fill: M.laminate, stroke: M.laminateEdge, strokeWidth: 0.8, keywords: ['workstation', 'computer desk', 'seat', 'work station'],
    draw: icon(30, 26, (c) => `${deskTop(c, 0.5, 0.5, 29, 14)}${computer(15, 2, 16)}${chair(15, 19.5, 10)}`),
  }),
  of('l-desk', 'L-shaped desk', {
    ...FURN, width: 32, height: 32, fill: M.laminate, stroke: M.laminateEdge, strokeWidth: 0.8, keywords: ['corner desk', 'return', 'l desk'],
    draw: icon(32, 32, (c) => `${shadow(0.5, 0.5, 31, 12)}<path d="M0.5 0.5H31.5V12.5H12.5V31.5H0.5Z" ${FS(c)}/>${computer(21, 2, 14)}${chair(21, 20, 10)}`),
  }),
  of('executive-desk', 'Executive desk', {
    ...FURN, width: 36, height: 30, fill: M.walnut, stroke: shade(M.walnut, 0.35), strokeWidth: 0.8, keywords: ['manager desk', 'large desk', 'office desk'],
    draw: icon(36, 30, (c) => `${deskTop(c, 0.5, 0.5, 35, 17, 1.5)}${computer(13, 2.2, 14)}<rect x="24" y="4" width="8" height="10" rx="0.5" fill="${M.white}" stroke="${P.inkSoft}" stroke-width="0.3" transform="rotate(8 28 9)"/>${chair(18, 23, 11, 0, '#2f3a48')}`),
  }),
  of('office-chair', 'Office chair', {
    ...FURN, width: 12, height: 12, fill: M.fabric, stroke: P.ink, strokeWidth: 0.6, keywords: ['chair', 'desk chair', 'task chair', 'seat'],
    draw: icon(24, 24, (c) => chair(12, 12, 20, 0, c.fill)),
  }),
  of('guest-chair', 'Guest chair', {
    ...FURN, width: 11, height: 11, fill: M.fabricLight, stroke: P.ink, strokeWidth: 0.6, keywords: ['chair', 'side chair', 'visitor chair', 'seat'],
    draw: icon(22, 22, (c) => `${shadow(3, 3, 16, 16, 2)}<rect x="3" y="3" width="16" height="16" rx="2" ${FS(c)}/><rect x="3" y="15" width="16" height="4" rx="1.5" fill="${shade(c.fill, 0.35)}"/>`),
  }),
  of('computer', 'Computer', {
    ...FURN, width: 16, height: 10, fill: M.screen, stroke: P.ink, strokeWidth: 0.4, keywords: ['monitor', 'pc', 'screen', 'keyboard', 'workstation'],
    draw: icon(32, 20, () => computer(16, 3, 26)),
  }),
  of('dual-monitors', 'Dual monitors', {
    ...FURN, width: 22, height: 10, fill: M.screen, stroke: P.ink, strokeWidth: 0.4, keywords: ['two screens', 'monitors', 'computer'],
    draw: icon(44, 20, () => computer(22, 3, 40, true)),
  }),
  of('laptop', 'Laptop', {
    ...FURN, width: 8, height: 6, fill: '#c3c9d1', stroke: P.ink, strokeWidth: 0.5, keywords: ['notebook', 'computer'],
    draw: icon(24, 18, (c) => `${shadow(2, 2, 20, 14, 1.5)}<rect x="2" y="2" width="20" height="6" rx="1" fill="${M.screen}"/><rect x="2" y="8" width="20" height="8" rx="1.5" ${FS(c)}/><rect x="9" y="12" width="6" height="3" rx="0.6" fill="${shade(c.fill, 0.15)}"/>`),
  }),

  of('conference-table', 'Conference table', {
    ...FURN, width: 80, height: 40, fill: M.walnut, stroke: shade(M.walnut, 0.35), strokeWidth: 0.8, keywords: ['meeting table', 'boardroom table', 'chairs'],
    note: 'Stretch it longer and more chairs are added.',
    draw: (c) => {
      const cs = 9; // chair size
      const tx = cs * 0.9, ty = cs * 0.75;
      const tw = Math.max(4, c.w - tx * 2), th = Math.max(4, c.h - ty * 2);
      const n = Math.max(1, Math.floor(tw / 14));
      const chairs = Array.from({ length: n }, (_, i) => {
        const x = tx + (tw / n) * (i + 0.5);
        return chair(x, ty - cs * 0.15, cs, 180) + chair(x, c.h - ty + cs * 0.15, cs, 0);
      }).join('');
      return `${chairs}${chair(tx - cs * 0.15, c.h / 2, cs, 90)}${chair(c.w - tx + cs * 0.15, c.h / 2, cs, -90)}${shadow(tx, ty, tw, th, th / 2)}<rect x="${r2(tx)}" y="${r2(ty)}" width="${r2(tw)}" height="${r2(th)}" rx="${r2(Math.min(th / 2, 8))}" ${FS(c)}/>`;
    },
  }),
  of('round-table', 'Round table with chairs', {
    ...FURN, width: 30, height: 30, fill: M.laminate, stroke: M.laminateEdge, strokeWidth: 0.8, keywords: ['meeting table', 'cafe table', 'break table', 'round'],
    draw: icon(30, 30, (c) => `${[0, 90, 180, 270].map((a) => {
      const t = (a * Math.PI) / 180;
      return chair(15 + Math.sin(t) * 10.5, 15 - Math.cos(t) * 10.5, 8, a + 180);
    }).join('')}<circle cx="15.8" cy="16" r="8.5" fill="${P.shadow}"/><circle cx="15" cy="15" r="8.5" ${FS(c)}/>`),
  }),
  of('printer', 'Printer and copier', {
    ...FURN, width: 16, height: 14, fill: '#e7e9ec', stroke: P.ink, strokeWidth: 0.6, keywords: ['copier', 'copy machine', 'scanner', 'printer', 'mfp'],
    draw: icon(32, 28, (c) => `${shadow(2, 2, 28, 24, 2)}<rect x="2" y="2" width="28" height="24" rx="2" ${FS(c)}/><rect x="5" y="5" width="15" height="12" rx="1" fill="${M.white}" stroke="${P.inkSoft}" stroke-width="0.6"/><path d="M8 9h9M8 12h9" stroke="${P.inkSoft}" stroke-width="0.6"/><rect x="22" y="5" width="5" height="4" rx="0.6" fill="${M.screen}"/><circle cx="24.5" cy="12" r="1.2" fill="${P.go}"/><rect x="5" y="20" width="22" height="3" rx="0.6" fill="${P.steel}"/>`),
  }),
  of('filing-cabinet', 'Filing cabinet', {
    ...FURN, width: 8, height: 12, fill: '#b7bec7', stroke: P.ink, strokeWidth: 0.6, keywords: ['file cabinet', 'files', 'drawers', 'storage'],
    draw: icon(16, 24, (c) => `${shadow(1, 1, 14, 22, 1)}<rect x="1" y="1" width="14" height="22" rx="1" ${FS(c)}/><path d="M1 8h14M1 15h14" stroke="${shade(c.fill, 0.3)}" stroke-width="0.6"/><rect x="5" y="20" width="6" height="2" rx="0.6" fill="${P.steelDark}"/>`),
  }),
  of('bookshelf', 'Bookshelf', {
    ...FURN, width: 30, height: 7, fill: M.walnut, stroke: shade(M.walnut, 0.35), strokeWidth: 0.6, keywords: ['bookcase', 'shelving', 'shelves', 'books'],
    draw: (c) => {
      const colors = ['#2f62c4', '#d23a32', '#1f8a4c', '#f2b705', '#6d4bb3', '#e7e3da'];
      let books = '';
      let x = c.sw + 1;
      for (let i = 0; x < c.w - c.sw - 2; i++) {
        const bw = 1.6 + ((i * 7) % 3) * 0.6;
        books += `<rect x="${r2(x)}" y="${r2(c.sw + 0.8)}" width="${r2(bw)}" height="${r2(Math.max(1, c.h * 0.55))}" fill="${colors[i % colors.length]}"/>`;
        x += bw + 0.4;
      }
      return `${shadow(0, 0, c.w, c.h)}${boxRect(c)}${books}`;
    },
  }),
  of('storage-cabinet', 'Storage cabinet', {
    ...FURN, width: 18, height: 9, fill: '#b7bec7', stroke: P.ink, strokeWidth: 0.6, keywords: ['supply cabinet', 'cupboard', 'locker', 'storage'],
    draw: (c) => `${shadow(0, 0, c.w, c.h)}${boxRect(c, 0.6)}<path d="M${r2(c.w / 2)} ${r2(c.sw)} V${r2(c.h - c.sw)}" stroke="${shade(c.fill, 0.3)}" stroke-width="0.6"/><rect x="${r2(c.w / 2 - 2.2)}" y="${r2(c.h - 2.2)}" width="1.4" height="1.4" fill="${P.steelDark}"/><rect x="${r2(c.w / 2 + 0.8)}" y="${r2(c.h - 2.2)}" width="1.4" height="1.4" fill="${P.steelDark}"/>`,
  }),
  of('lockers', 'Lockers', {
    ...FURN, width: 40, height: 8, fill: '#8fa5bd', stroke: P.ink, strokeWidth: 0.6, keywords: ['employee lockers', 'staff lockers', 'storage'],
    draw: (c) => {
      const n = Math.max(1, Math.round(c.w / 8)), dw = c.w / n;
      const doors = Array.from({ length: n }, (_, i) => `${i ? `<path d="M${r2(i * dw)} ${r2(c.sw)} V${r2(c.h - c.sw)}" stroke="${shade(c.fill, 0.35)}" stroke-width="0.6"/>` : ''}<rect x="${r2(i * dw + dw * 0.7)}" y="${r2(c.h * 0.55)}" width="1" height="${r2(c.h * 0.25)}" fill="${P.ink}"/>`).join('');
      return `${shadow(0, 0, c.w, c.h)}${boxRect(c)}${doors}`;
    },
  }),

  of('sofa', 'Sofa', {
    ...FURN, width: 36, height: 15, fill: M.fabricLight, stroke: P.ink, strokeWidth: 0.6, keywords: ['couch', 'settee', 'lounge seating', 'waiting'],
    draw: (c) => {
      const arm = Math.min(4, c.w * 0.12), back = Math.min(4.5, c.h * 0.3);
      const seatW = c.w - arm * 2;
      const n = Math.max(1, Math.round(seatW / 12));
      const cushions = Array.from({ length: n - 1 }, (_, i) => `<path d="M${r2(arm + (seatW / n) * (i + 1))} ${r2(back)} V${r2(c.h - 1.5)}" stroke="${shade(c.fill, 0.25)}" stroke-width="0.6"/>`).join('');
      return `${shadow(0, 0, c.w, c.h, 2)}<rect x="${r2(c.sw / 2)}" y="${r2(c.sw / 2)}" width="${r2(c.w - c.sw)}" height="${r2(c.h - c.sw)}" rx="2.5" ${FS(c)}/><rect x="${r2(arm)}" y="${r2(c.sw / 2)}" width="${r2(seatW)}" height="${r2(back)}" rx="1.5" fill="${shade(c.fill, 0.25)}"/>${cushions}`;
    },
  }),
  of('armchair', 'Armchair', {
    ...FURN, width: 15, height: 15, fill: M.fabricLight, stroke: P.ink, strokeWidth: 0.6, keywords: ['lounge chair', 'club chair', 'seat', 'waiting'],
    draw: icon(30, 30, (c) => `${shadow(2, 2, 26, 26, 4)}<rect x="2" y="2" width="26" height="26" rx="5" ${FS(c)}/><rect x="2" y="2" width="26" height="8" rx="4" fill="${shade(c.fill, 0.25)}"/><rect x="2" y="8" width="5" height="20" rx="2.5" fill="${shade(c.fill, 0.15)}"/><rect x="23" y="8" width="5" height="20" rx="2.5" fill="${shade(c.fill, 0.15)}"/>`),
  }),
  of('coffee-table', 'Coffee table', {
    ...FURN, width: 20, height: 11, fill: M.walnut, stroke: shade(M.walnut, 0.35), strokeWidth: 0.6, keywords: ['side table', 'low table', 'lounge'],
    draw: (c) => `${shadow(0, 0, c.w, c.h, 1.5)}${boxRect(c, 1.5)}<rect x="${r2(c.w * 0.2)}" y="${r2(c.h * 0.25)}" width="${r2(c.w * 0.22)}" height="${r2(c.h * 0.45)}" rx="0.5" fill="${M.white}" fill-opacity="0.85"/>`,
  }),
  of('potted-plant', 'Potted plant', {
    ...FURN, width: 10, height: 10, fill: P.foliage, stroke: P.foliageDark, strokeWidth: 0.5, keywords: ['plant', 'greenery', 'planter', 'tree'],
    draw: icon(20, 20, () => plantTop(10, 10, 8.5)),
  }),
  of('water-cooler', 'Water cooler', {
    ...FURN, width: 7, height: 7, fill: '#9dcbe6', stroke: P.ink, strokeWidth: 0.5, keywords: ['water', 'drinking fountain', 'bottle filler'],
    draw: icon(14, 14, (c) => `${shadow(1, 1, 12, 12, 1.5)}<rect x="1" y="1" width="12" height="12" rx="1.5" fill="#e7e9ec" stroke="${P.ink}" stroke-width="0.5"/><circle cx="7" cy="7" r="4.4" ${F(c)} stroke="${P.waterEdge}" stroke-width="0.6"/><circle cx="7" cy="7" r="1.4" fill="${M.white}"/>`),
  }),
  of('refrigerator', 'Refrigerator', {
    ...FURN, width: 15, height: 14, fill: '#eceef1', stroke: P.ink, strokeWidth: 0.6, keywords: ['fridge', 'kitchen', 'appliance'],
    draw: icon(30, 28, (c) => `${shadow(1, 1, 28, 26, 2)}<rect x="1" y="1" width="28" height="26" rx="2" ${FS(c)}/><path d="M1 22H29" stroke="${P.inkSoft}" stroke-width="0.6"/><rect x="6" y="23.5" width="18" height="1.6" rx="0.8" fill="${P.steelDark}"/>`),
  }),
  of('kitchen-counter', 'Counter with sink', {
    ...FURN, width: 60, height: 12, fill: '#d9d6cf', stroke: P.inkSoft, strokeWidth: 0.6, keywords: ['kitchen', 'counter', 'sink', 'cabinets', 'kitchenette'],
    draw: (c) => {
      const sw = Math.min(14, c.w * 0.3), sh = c.h * 0.6;
      const sx = c.w * 0.35 - sw / 2, sy = (c.h - sh) / 2;
      return `${shadow(0, 0, c.w, c.h)}${boxRect(c)}<rect x="${r2(sx)}" y="${r2(sy)}" width="${r2(sw)}" height="${r2(sh)}" rx="1.5" fill="${P.steel}" stroke="${P.steelDark}" stroke-width="0.6"/><circle cx="${r2(sx + sw / 2)}" cy="${r2(sy + 1.3)}" r="0.9" fill="${P.steelDark}"/><rect x="${r2(c.w * 0.68)}" y="${r2(sy)}" width="${r2(Math.min(12, c.w * 0.22))}" height="${r2(sh)}" rx="1" fill="${M.screen}"/>`;
    },
  }),
  of('whiteboard', 'Whiteboard', {
    ...FURN, width: 30, height: 3, fill: M.white, stroke: P.steelDark, strokeWidth: 0.6, keywords: ['dry erase', 'board', 'wall board'],
    draw: (c) => `${boxRect(c)}<path d="M${r2(c.w * 0.12)} ${r2(c.h - c.sw)} h${r2(c.w * 0.3)}" stroke="${P.info}" stroke-width="0.6"/>`,
  }),
  of('wall-screen', 'Wall screen', {
    ...FURN, width: 26, height: 3, fill: M.screen, stroke: P.ink, strokeWidth: 0.4, keywords: ['tv', 'television', 'display', 'monitor', 'projector screen'],
    draw: (c) => `${boxRect(c, 0.5)}<rect x="${r2(c.w * 0.1)}" y="${r2(c.h * 0.6)}" width="${r2(c.w * 0.8)}" height="${r2(c.h * 0.2)}" fill="${M.glow}" fill-opacity="0.6"/>`,
  }),
  of('server-rack', 'Server rack', {
    ...FURN, width: 12, height: 20, fill: '#2f3742', stroke: P.ink, strokeWidth: 0.6, keywords: ['server', 'network rack', 'it', 'data'],
    draw: icon(24, 40, (c) => `${shadow(1, 1, 22, 38, 1)}<rect x="1" y="1" width="22" height="38" rx="1" ${FS(c)}/>${[0, 1, 2, 3, 4, 5].map((i) => `<rect x="4" y="${4 + i * 5.5}" width="16" height="4" rx="0.5" fill="#46505e"/><circle cx="17.5" cy="${6 + i * 5.5}" r="0.8" fill="${i % 3 === 0 ? P.go : '#7fd3a0'}"/>`).join('')}<rect x="4" y="36" width="16" height="2" fill="${P.steel}"/>`),
  }),
  of('phone-booth', 'Phone booth', {
    ...FURN, width: 25, height: 25, fill: '#dfe7ee', stroke: P.wall, strokeWidth: 0.8, keywords: ['call booth', 'quiet pod', 'privacy pod', 'focus booth'],
    draw: icon(25, 25, (c) => `${shadow(0.5, 0.5, 24, 24, 1.5)}<rect x="0.5" y="0.5" width="24" height="24" rx="1.5" ${FS(c)}/><rect x="0.5" y="21.5" width="24" height="3" fill="${P.glass}" stroke="${P.glassDark}" stroke-width="0.5"/><rect x="3" y="3" width="19" height="6" rx="0.8" fill="${M.laminate}" stroke="${M.laminateEdge}" stroke-width="0.5"/>${chair(12.5, 14, 8)}`),
  }),
];
