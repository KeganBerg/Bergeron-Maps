/**
 * Schools and campuses. Only the school-specific objects live here; anything
 * the general library already has (stop sign, crosswalk, fire hydrant, speed
 * bump, loading dock...) is reused and listed in this category through
 * SCHOOL_SHARED below, so the library keeps one of each.
 */
import { category, type AssetCategory } from '../defs';
import { along, badge, badgeFor, badgeLayout, building, hLine, lane, laneArrow, raisedShadow, room, signRect, zone } from '../draw';
import { glyph } from '../glyphs';
import { boxRect, F, FS, fitText, icon, P, r2, S, shade, text, type DrawFn } from '../style';

export const SCHOOL: AssetCategory = 'Schools and campuses';
const sc = category(SCHOOL);
const ALSO = [SCHOOL] as AssetCategory[];

/** School bus yellow, used for every bus object so they read as one family. */
const BUS_YELLOW = '#f2b01e';
const TURF = '#6aa84f';
const DIRT = '#c89a6a';
const LINE = '#ffffff';

/**
 * Existing general assets that cover items on the school list. They are shown
 * in the Schools and campuses category too, with school words added to search,
 * instead of being drawn a second time.
 */
export const SCHOOL_SHARED: Record<string, string[]> = {
  building: ['main school building', 'school'],
  'building-entrance': ['main entrance', 'school entrance', 'front office'],
  'ped-entrance': ['student walkers', 'gate'],
  'entrance-lane': ['vehicle entrance', 'car entrance'],
  'exit-lane': ['vehicle exit', 'car exit'],
  'emergency-exit': ['school', 'evacuation'],
  'loading-dock': ['delivery', 'cafeteria deliveries'],
  'valet-pickup': ['parent pickup', 'car line', 'car rider', 'dismissal'],
  'valet-dropoff': ['parent drop-off', 'car line', 'car rider', 'arrival'],
  turnaround: ['bus turnaround', 'bus'],
  crosswalk: ['school crossing', 'crossing guard'],
  'pedestrian-bridge': ['campus bridge'],
  hydrant: ['school'],
  'pin-emergency-meeting': ['emergency assembly point', 'fire drill', 'evacuation point', 'rally point'],
  'fire-lane': ['school'],
  'stop-sign': ['school'],
  'yield-sign': ['school'],
  'one-way-sign': ['school', 'car line'],
  'speed-limit-sign': ['school zone', 'school'],
  'directional-sign': ['campus', 'wayfinding'],
  'ped-crossing-sign': ['school crossing', 'children'],
  'concrete-divider': ['traffic barrier', 'barricade'],
  'speed-bump': ['school'],
  'safety-island': ['traffic island', 'channelizing island'],
};

// ---------------------------------------------------------------- buildings and rooms

const BLD = { layer: 'structure' as const, fill: P.building, stroke: P.wall, strokeWidth: 2.5, labelPos: 'badge' as const };
const bld = (key: string, name: string, g: string, color: string, w: number, h: number, keywords: string[] = []) =>
  sc(key, name, { ...BLD, width: w, height: h, draw: building(g, color), label: name, keywords: ['building', 'school', 'campus', ...keywords] });
const RM = { layer: 'structure' as const, fill: P.room, stroke: P.wall, strokeWidth: 3, labelPos: 'badge' as const, width: 160, height: 110 };

/** A modular classroom: flat standing-seam roof, skirting, and steps up to the door. */
const portable: DrawFn = (c) => {
  const steps = 22;
  const bh = Math.max(20, c.h - steps);
  const body = { ...c, h: bh };
  const seams = along({ ...c, w: c.w }, 12, (x) => `<path d="M${r2(x)} ${r2(c.sw + 1)} V${r2(bh - c.sw - 1)}" stroke="${shade(c.fill, 0.12)}" stroke-width="0.8"/>`, 6);
  const sx = Math.max(c.sw + 4, c.w * 0.68), sw = Math.min(34, c.w * 0.22);
  const tread = [0, 1, 2].map((i) => `<path d="M${r2(sx)} ${r2(bh + 4 + i * 6)} h${r2(sw)}" stroke="${P.ink}" stroke-opacity="0.5" stroke-width="0.8"/>`).join('');
  const b = badgeLayout(c.w, bh);
  return `${raisedShadow(0, 0, c.w, bh, 2, 3)}${boxRect(body, 2)}${seams}<rect x="${r2(sx)}" y="${r2(bh)}" width="${r2(sw)}" height="${r2(steps - 1)}" fill="${P.concrete}" stroke="${P.concreteEdge}" stroke-width="1"/>${tread}<path d="M${r2(sx - 2)} ${r2(bh)} v${r2(steps - 1)} M${r2(sx + sw + 2)} ${r2(bh)} v${r2(steps - 1)}" stroke="${P.steelDark}" stroke-width="1.5"/>${badgeFor(c, 'chalkboard', b.cx, b.cy, b.r, P.info)}`;
};

const BUILDINGS = [
  bld('admin-building', 'Administration building', 'clipboard', P.inkSoft, 240, 160, ['admin', 'front office', 'district office']),
  bld('classroom-building', 'Classroom building', 'chalkboard', P.info, 400, 200, ['classrooms', 'academic', 'wing', 'hall']),
  sc('portable-classroom', 'Portable classroom', {
    ...BLD, width: 200, height: 142, label: 'Portable', draw: portable, keywords: ['portable', 'modular', 'trailer', 'temporary classroom', 'relocatable'],
  }),
  bld('library-building', 'Library', 'book', P.teal, 260, 180, ['media center', 'books']),
  bld('cafeteria', 'Cafeteria', 'dine', P.orange, 300, 220, ['lunchroom', 'dining hall', 'kitchen', 'canteen']),
  bld('gymnasium', 'Gymnasium', 'ball', P.danger, 500, 400, ['gym', 'field house', 'sports hall']),
  bld('auditorium', 'Auditorium', 'stage', P.violet, 400, 300, ['theater', 'theatre', 'performing arts', 'assembly hall']),
  bld('maintenance-building', 'Maintenance building', 'wrench', '#8a5a2b', 200, 140, ['maintenance', 'custodial', 'facilities', 'shop']),
  bld('storage-building', 'Storage building', 'storage', P.inkSoft, 160, 120, ['storage', 'shed', 'warehouse']),
  sc('principal-office', "Principal's office", { ...RM, draw: room('desk', P.violet), label: "Principal's office", keywords: ['principal', 'office', 'room', 'head teacher', 'dean'] }),
  sc('nurse-office', "Nurse's office", { ...RM, draw: room('cross', P.danger), label: "Nurse's office", keywords: ['nurse', 'health room', 'clinic', 'sick bay', 'room'] }),
];

// ---------------------------------------------------------------- entrances and access

/** A doorway with an inward arrow and a badge that says who it is for. */
const doorway = (g: string, color: string) => icon(80, 44, (c) =>
  `<rect x="0" y="4" width="18" height="7" fill="${P.wall}"/><rect x="62" y="4" width="18" height="7" fill="${P.wall}"/><rect x="18" y="5.5" width="22" height="4" ${FS(c)}/><rect x="40" y="5.5" width="22" height="4" ${FS(c)}/><path d="M18 9.5 A22 22 0 0 0 40 31.5M62 9.5 A22 22 0 0 1 40 31.5" fill="none" stroke="${P.inkSoft}" stroke-width="0.8" stroke-dasharray="2 2"/><path d="M40 40V18M34 24l6-6 6 6" fill="none" stroke="${P.go}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>${badge(g, 66, 29, 9, color)}`);

const door = (key: string, name: string, g: string, color: string, keywords: string[]) =>
  sc(key, name, { draw: doorway(g, color), width: 80, height: 44, layer: 'landmarks', fill: '#cfe3f0', stroke: P.ink, strokeWidth: 1, labelPos: 'below', keywords: ['entrance', 'entry', 'door', ...keywords] });

const ENTRANCES = [
  door('student-entrance', 'Student entrance', 'backpack', P.info, ['students', 'kids', 'walkers']),
  door('staff-entrance', 'Faculty/staff entrance', 'staff', P.inkSoft, ['faculty', 'staff', 'teachers', 'employee']),
  door('visitor-entrance', 'Visitor entrance', 'visitor', P.teal, ['visitors', 'guests', 'sign in', 'front office']),
  door('bus-entrance', 'Bus entrance', 'bus', '#b07a00', ['bus', 'buses']),
  door('delivery-entrance', 'Delivery entrance', 'truck', P.orange, ['deliveries', 'receiving', 'service door']),
  sc('security-checkpoint', 'Security checkpoint', {
    width: 120, height: 50, layer: 'landmarks', fill: '#5a6b80', stroke: P.ink, strokeWidth: 1.2, labelPos: 'below', keywords: ['guard', 'guard shack', 'check in', 'security', 'sro', 'booth'],
    draw: icon(120, 50, (c) => `${raisedShadow(4, 6, 42, 38, 3, 2)}<rect x="4" y="6" width="42" height="38" rx="3" ${FS(c)}/><rect x="8" y="10" width="34" height="30" rx="1.5" fill="#000" fill-opacity="0.1"/><rect x="44" y="14" width="3" height="22" fill="${P.glass}" stroke="${P.glassDark}" stroke-width="0.6"/>${badge('shield', 25, 25, 9, c.fill)}${raisedShadow(52, 19, 12, 12, 2)}<rect x="52" y="19" width="12" height="12" rx="2" fill="${P.safety}" stroke="${P.ink}" stroke-width="1"/><rect x="64" y="22" width="54" height="6" rx="3" fill="#ffffff" stroke="${P.ink}" stroke-width="1"/>${[0, 1, 2].map((i) => `<rect x="${72 + i * 16}" y="22" width="8" height="6" fill="${P.danger}"/>`).join('')}`),
  }),
];

/** Sliding gate on its track, with the card reader drivers stop at. */
const accessGate = icon(130, 46, (c) => {
  const bars = Array.from({ length: 13 }, (_, i) => `M${18 + i * 7} 14v10`).join('');
  return `<rect x="2" y="13" width="10" height="12" ${FS(c)}/><rect x="104" y="13" width="10" height="12" ${FS(c)}/><path d="M12 19H104" stroke="${P.inkSoft}" stroke-width="0.8" stroke-dasharray="3 3"/><rect x="12" y="14" width="92" height="10" rx="1" fill="none" stroke="${c.fill}" stroke-width="2.4"/><path d="${bars}" stroke="${c.fill}" stroke-width="1.4"/><path d="M58 30h-16M46 26.5 42 30l4 3.5" fill="none" stroke="${P.inkSoft}" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>${raisedShadow(114, 30, 12, 12, 2)}<rect x="114" y="30" width="12" height="12" rx="2" fill="#2b3440" stroke="${P.ink}" stroke-width="1"/><rect x="116.5" y="32.5" width="7" height="4" rx="0.8" fill="#7fd1a8"/>${glyph('lock', 120, 6, 10, P.ink)}`;
});

// ---------------------------------------------------------------- transportation

const ZONE = { layer: 'structure' as const, fillOpacity: 0.16, strokeWidth: 2, labelPos: 'badge' as const, dashed: true };
const zn = (key: string, name: string, g: string, color: string, keywords: string[], w = 260, h = 120) =>
  sc(key, name, { ...ZONE, draw: zone({ glyph: g }), width: w, height: h, fill: color, stroke: color, label: name.replace(/ zone$| area$/, ''), keywords: ['zone', 'school', ...keywords] });

/**
 * Bus seen from above, front at the top: a short hood (or none), the
 * windshield, white roof with two escape hatches, black rub rails and the
 * stop arm on the driver's side.
 */
const schoolBus = (L: number, W: number, hood: number, cutaway: boolean) => icon(W + 10, L + 4, (c) => {
  const x = 6, y = 2, cab = y + hood;
  const roofTop = cab + 9;
  const roofH = L - hood - 13;
  const hoodPath = hood > 0
    ? `<path d="M${x + 4} ${y + hood + 1} V${y + 4} Q${x + 4} ${y} ${x + 9} ${y} H${x + W - 9} Q${x + W - 4} ${y} ${x + W - 4} ${y + 4} V${y + hood + 1}Z" ${FS(c)}/><path d="M${x + W / 2} ${y + 2} V${y + hood}" stroke="${P.ink}" stroke-opacity="0.3" stroke-width="0.8"/>`
    : '';
  const bodyY = hood > 0 ? cab : y;
  const bodyL = L - (bodyY - y);
  const rails = [0.35, 0.6, 0.85].map((f) => `<path d="M${x} ${r2(bodyY + bodyL * f)} h2.2M${x + W - 2.2} ${r2(bodyY + bodyL * f)} h2.2" stroke="${P.ink}" stroke-width="1.6"/>`).join('');
  const hatches = [0.3, 0.68].map((f) => `<rect x="${r2(x + W / 2 - 5)}" y="${r2(roofTop + roofH * f - 5)}" width="10" height="10" rx="1" fill="#e4e6ea" stroke="${P.inkSoft}" stroke-width="0.8"/>`).join('');
  const box = cutaway ? `<path d="M${x + 1} ${r2(roofTop - 1)} H${x + W - 1}" stroke="${P.ink}" stroke-width="0.8"/>` : '';
  return `<rect x="${x + 1.5}" y="${y + 2}" width="${W}" height="${L}" rx="4" fill="${P.shadow}"/>${hoodPath}<rect x="${x}" y="${bodyY}" width="${W}" height="${bodyL}" rx="${hood > 0 ? 2.5 : 4}" ${FS(c)}/><path d="M${x + 2} ${cab + 1} H${x + W - 2} L${x + W - 3.5} ${cab + 8} H${x + 3.5}Z" fill="${P.glass}" stroke="${P.glassDark}" stroke-width="0.6"/><rect x="${x + 3}" y="${roofTop}" width="${W - 6}" height="${roofH}" rx="2" fill="#f4f4f1" stroke="${shade(c.fill, 0.2)}" stroke-width="0.8"/>${hatches}${box}${rails}<rect x="${x - 5}" y="${cab + 12}" width="5" height="5" fill="${P.danger}" stroke="${P.ink}" stroke-width="0.6"/><rect x="${x - 2}" y="${cab + 2}" width="2.4" height="3.2" rx="1" ${FS(c)}/><rect x="${x + W - 0.4}" y="${cab + 2}" width="2.4" height="3.2" rx="1" ${FS(c)}/><rect x="${x + 3}" y="${y + L - 2.4}" width="${r2(W * 0.18)}" height="1.6" rx="0.8" fill="#c0392b"/><rect x="${r2(x + W - 3 - W * 0.18)}" y="${y + L - 2.4}" width="${r2(W * 0.18)}" height="1.6" rx="0.8" fill="#c0392b"/>`;
});

/** A one-way bus loop: a ring road around a grass island, buses circulate counter-clockwise. */
const busLoop: DrawFn = (c) => {
  const t = Math.min(c.h * 0.32, 70);
  const R = (w: number, h: number, inset: number, extra: string) =>
    `<rect x="${r2(inset)}" y="${r2(inset)}" width="${r2(Math.max(1, w - inset * 2))}" height="${r2(Math.max(1, h - inset * 2))}" rx="${r2(Math.max(0, Math.min(w, h) / 2 - inset))}" ${extra}/>`;
  const edge = `fill="none" stroke="${P.paint}" stroke-width="2"`;
  const words = Math.min(t * 0.32, 14);
  const label = c.w > c.h * 1.6 ? text(c.w / 2, c.h - t / 2, words, 'BUS ONLY', P.paint) + text(c.w / 2, t / 2, words, 'BUS ONLY', P.paint) : '';
  return `${R(c.w, c.h, c.sw / 2, FS(c))}${R(c.w, c.h, 3.5, edge)}${R(c.w, c.h, t - 3.5, edge)}${R(c.w, c.h, t, `fill="${P.grass}" stroke="${P.concreteEdge}" stroke-width="2.5"`)}${laneArrow(c.w * 0.22, c.h - t / 2, Math.min(36, t * 0.8))}${laneArrow(c.w * 0.78, c.h - t / 2, Math.min(36, t * 0.8))}${laneArrow(c.w * 0.22, t / 2, Math.min(36, t * 0.8), P.paint, true)}${laneArrow(c.w * 0.78, t / 2, Math.min(36, t * 0.8), P.paint, true)}${label}`;
};

const TRANSPORT = [
  zn('student-dropoff', 'Student drop-off zone', 'backpack', P.info, ['drop off', 'dropoff', 'arrival', 'morning', 'curb']),
  zn('student-pickup', 'Student pickup zone', 'backpack', P.go, ['pickup', 'pick up', 'dismissal', 'afternoon', 'curb']),
  zn('bus-loading', 'Bus loading zone', 'bus', '#b07a00', ['bus', 'loading', 'board', 'dismissal'], 300, 80),
  zn('bus-unloading', 'Bus unloading zone', 'bus', P.orange, ['bus', 'unloading', 'arrival'], 300, 80),
  zn('bus-staging', 'Bus staging area', 'bus', P.violet, ['bus', 'staging', 'holding', 'queue', 'wait'], 320, 160),
  sc('bus-loop', 'Bus loop', {
    layer: 'structure', fill: P.asphalt, stroke: P.asphaltEdge, strokeWidth: 0, width: 900, height: 400, labelColor: '#ffffff',
    keywords: ['bus', 'loop', 'ring road', 'circulation', 'one way', 'bus lane'], draw: busLoop,
  }),
  sc('school-bus', 'School bus', {
    also: ['Vehicles'], width: 50, height: 204, layer: 'landmarks', fill: BUS_YELLOW, stroke: P.ink, strokeWidth: 1, labelPos: 'below',
    keywords: ['bus', 'vehicle', 'yellow bus', 'type c'], draw: schoolBus(200, 40, 22, false),
  }),
  sc('short-school-bus', 'Short school bus', {
    also: ['Vehicles'], width: 48, height: 128, layer: 'landmarks', fill: BUS_YELLOW, stroke: P.ink, strokeWidth: 1, labelPos: 'below',
    keywords: ['bus', 'vehicle', 'short bus', 'mini bus', 'activity bus', 'type a', 'special needs'], draw: schoolBus(124, 38, 20, true),
  }),
];

// ---------------------------------------------------------------- athletics

/** American football field, 360 × 160 ft, drawn into (x0, y0, W, H). */
function footballMarks(x0: number, y0: number, W: number, H: number): string {
  const u = W / 360, v = H / 160, ez = 30 * u, lw = Math.max(1, Math.min(u, v) * 0.5);
  let s = '';
  for (let i = 0; i < 20; i += 2) s += `<rect x="${r2(x0 + ez + i * 15 * u)}" y="${r2(y0)}" width="${r2(15 * u)}" height="${r2(H)}" fill="#ffffff" fill-opacity="0.07"/>`;
  s += `<rect x="${r2(x0)}" y="${r2(y0)}" width="${r2(ez)}" height="${r2(H)}" fill="#000" fill-opacity="0.12"/><rect x="${r2(x0 + W - ez)}" y="${r2(y0)}" width="${r2(ez)}" height="${r2(H)}" fill="#000" fill-opacity="0.12"/>`;
  let d = '';
  for (let i = 0; i <= 20; i++) d += `M${r2(x0 + ez + i * 15 * u)} ${r2(y0)}V${r2(y0 + H)}`;
  let hash = '';
  for (let i = 1; i < 100; i++) {
    const x = r2(x0 + ez + i * 3 * u);
    hash += `M${x} ${r2(y0 + 1)}v${r2(2 * v)}M${x} ${r2(y0 + H - 1)}v${r2(-2 * v)}M${x} ${r2(y0 + H / 3 - v)}v${r2(2 * v)}M${x} ${r2(y0 + (H * 2) / 3 - v)}v${r2(2 * v)}`;
  }
  s += `<path d="${d}" stroke="${LINE}" stroke-width="${r2(lw * 1.4)}"/><path d="${hash}" stroke="${LINE}" stroke-width="${r2(lw)}"/>`;
  const size = Math.max(4, 6 * v);
  for (let i = 1; i <= 9; i++) {
    const yd = String(i <= 5 ? i * 10 : 100 - i * 10);
    const x = x0 + ez + i * 30 * u;
    s += text(x, y0 + H * 0.2, size, yd, LINE) + text(x, y0 + H * 0.8, size, yd, LINE);
  }
  const post = (x: number) => `<path d="M${r2(x)} ${r2(y0 + H / 2 - 11.7 * v)}V${r2(y0 + H / 2 + 11.7 * v)}" stroke="${P.paintYellow}" stroke-width="${r2(lw * 2.4)}" stroke-linecap="round"/>`;
  s += `<rect x="${r2(x0)}" y="${r2(y0)}" width="${r2(W)}" height="${r2(H)}" fill="none" stroke="${LINE}" stroke-width="${r2(lw * 2.4)}"/>${post(x0 + lw * 2)}${post(x0 + W - lw * 2)}`;
  return s;
}

const football: DrawFn = (c) => `${boxRect(c)}${footballMarks(c.sw, c.sw, c.w - c.sw * 2, c.h - c.sw * 2)}`;

/** Soccer field, 330 × 210 ft (110 × 70 yd). */
const soccer: DrawFn = (c) => {
  const m = c.sw + 6, W = c.w - m * 2, H = c.h - m * 2;
  const u = W / 330, v = H / 210, cy = m + H / 2, lw = Math.max(1, Math.min(u, v) * 0.5) * 1.4;
  const L = `fill="none" stroke="${LINE}" stroke-width="${r2(lw)}"`;
  let mow = '';
  for (let i = 0; i < 11; i += 2) mow += `<rect x="${r2(m + i * 30 * u)}" y="${r2(m)}" width="${r2(30 * u)}" height="${r2(H)}" fill="#ffffff" fill-opacity="0.07"/>`;
  const end = (x: number, dir: 1 | -1) => {
    const px = x + dir * 54 * u, gx = x + dir * 18 * u, spot = x + dir * 36 * u;
    const arcR = 30;
    const dy = Math.sqrt(arcR * arcR - 18 * 18) * v;
    return `<path d="M${r2(x)} ${r2(cy - 66 * v)}H${r2(px)}V${r2(cy + 66 * v)}H${r2(x)}" ${L}/><path d="M${r2(x)} ${r2(cy - 30 * v)}H${r2(gx)}V${r2(cy + 30 * v)}H${r2(x)}" ${L}/><circle cx="${r2(spot)}" cy="${r2(cy)}" r="${r2(lw)}" fill="${LINE}"/><path d="M${r2(px)} ${r2(cy - dy)}A${r2(arcR * u)} ${r2(arcR * v)} 0 0 ${dir > 0 ? 1 : 0} ${r2(px)} ${r2(cy + dy)}" ${L}/><rect x="${r2(dir > 0 ? x - 6 : x)}" y="${r2(cy - 12 * v)}" width="6" height="${r2(24 * v)}" fill="none" stroke="${LINE}" stroke-width="${r2(lw)}"/>`;
  };
  return `${boxRect(c)}${mow}<rect x="${r2(m)}" y="${r2(m)}" width="${r2(W)}" height="${r2(H)}" ${L}/><path d="M${r2(m + W / 2)} ${r2(m)}V${r2(m + H)}" ${L}/><ellipse cx="${r2(m + W / 2)}" cy="${r2(cy)}" rx="${r2(30 * u)}" ry="${r2(30 * v)}" ${L}/><circle cx="${r2(m + W / 2)}" cy="${r2(cy)}" r="${r2(lw)}" fill="${LINE}"/>${end(m, 1)}${end(m + W, -1)}`;
};

/**
 * Baseball or softball field: home plate at the bottom, foul lines at 45°,
 * an outfield fence arc through both foul poles and dead centre. Drawn in feet
 * and scaled as one piece, so the diamond never distorts.
 */
const diamondField = (o: { bases: number; mound: number; pole: number; center: number; skin: number; grassInfield: boolean }) => {
  const k = (o.pole * o.pole - o.center * o.center) / (Math.SQRT2 * o.pole - 2 * o.center);
  const R = o.center - k;
  const half = o.pole / Math.SQRT2;
  const vw = Math.ceil(half * 2 + 12), vh = Math.ceil(o.center + 34);
  return icon(vw, vh, (c) => {
    const hx = vw / 2, hy = vh - 26;
    const pole = (s: number) => `${r2(hx + s * half)} ${r2(hy - half)}`;
    const fan = `M${r2(hx)} ${r2(hy)} L${pole(-1)} A${r2(R)} ${r2(R)} 0 0 1 ${pole(1)} Z`;
    const b = o.bases / Math.SQRT2;
    const id = `fan${o.center}`;
    const base = (x: number, y: number) => `<rect x="${r2(x - 1.5)}" y="${r2(y - 1.5)}" width="3" height="3" fill="#fff" stroke="${P.ink}" stroke-width="0.3" transform="rotate(45 ${r2(x)} ${r2(y)})"/>`;
    const inset = o.bases * 0.13;
    const grass = o.grassInfield
      ? `<path d="M${r2(hx)} ${r2(hy - inset * 1.4)} L${r2(hx + b - inset)} ${r2(hy - b)} L${r2(hx)} ${r2(hy - 2 * b + inset)} L${r2(hx - b + inset)} ${r2(hy - b)} Z" fill="${c.fill}" fill-opacity="${c.fo}"/><circle cx="${r2(hx)}" cy="${r2(hy - o.mound)}" r="9" fill="${DIRT}"/>`
      : '';
    const fence = c.sw > 0 ? `<path d="M${pole(-1)} A${r2(R)} ${r2(R)} 0 0 1 ${pole(1)}" fill="none" ${S(c)}/>` : '';
    return `<defs><clipPath id="${id}"><path d="${fan}"/></clipPath></defs><path d="${fan}" transform="translate(2 3)" fill="${P.shadow}" fill-opacity="0.5"/><path d="${fan}" ${F(c)}/><g clip-path="url(#${id})"><circle cx="${r2(hx)}" cy="${r2(hy - k)}" r="${r2(R)}" fill="none" stroke="${DIRT}" stroke-width="20"/><circle cx="${r2(hx)}" cy="${r2(hy - o.mound)}" r="${r2(o.skin)}" fill="${DIRT}"/></g><circle cx="${r2(hx)}" cy="${r2(hy)}" r="13" fill="${DIRT}"/>${grass}<path d="M${r2(hx)} ${r2(hy)} L${pole(-1)} M${r2(hx)} ${r2(hy)} L${pole(1)}" stroke="${LINE}" stroke-width="1"/>${fence}<rect x="${r2(hx - 3)}" y="${r2(hy - o.mound - 0.5)}" width="6" height="1.2" fill="#fff"/>${base(hx + b, hy - b)}${base(hx, hy - 2 * b)}${base(hx - b, hy - b)}<path d="M${r2(hx - 1.4)} ${r2(hy - 1.4)}h2.8v1.4l-1.4 1.4-1.4-1.4Z" fill="#fff"/><path d="M${r2(hx - 60)} ${r2(hy + 20)} Q${r2(hx)} ${r2(hy + 30)} ${r2(hx + 60)} ${r2(hy + 20)}" fill="none" stroke="${P.steelDark}" stroke-width="2"/>`;
  });
};

/** Hard court with white lines, drawn in feet and stretched to the object's size. */
const court = (draw: (x: (ft: number) => number, y: (ft: number) => number, u: number, v: number, lw: number) => string, wFt: number, hFt: number): DrawFn => (c) => {
  const u = c.w / wFt, v = c.h / hFt, lw = Math.max(1, Math.min(u, v) * 0.35);
  return `${boxRect(c)}${draw((ft) => ft * u, (ft) => ft * v, u, v, lw)}`;
};

const basketball = court((x, y, u, v, lw) => {
  const L = `fill="none" stroke="${LINE}" stroke-width="${r2(lw * 1.4)}"`;
  const cy = y(25);
  const end = (dir: 1 | -1) => {
    const base = dir > 0 ? x(0) : x(94);
    const ft = (n: number) => base + dir * n * u;
    const R = 19.75;
    return `<path d="M${r2(base)} ${r2(cy - 6 * v)}H${r2(ft(19))}V${r2(cy + 6 * v)}H${r2(base)}" fill="${P.danger}" fill-opacity="0.18" stroke="${LINE}" stroke-width="${r2(lw * 1.4)}"/><ellipse cx="${r2(ft(19))}" cy="${r2(cy)}" rx="${r2(6 * u)}" ry="${r2(6 * v)}" ${L}/><path d="M${r2(base)} ${r2(cy - R * v)}H${r2(ft(5.25))}A${r2(R * u)} ${r2(R * v)} 0 0 ${dir > 0 ? 1 : 0} ${r2(ft(5.25))} ${r2(cy + R * v)}H${r2(base)}" ${L}/><path d="M${r2(ft(4))} ${r2(cy - 3 * v)}V${r2(cy + 3 * v)}" stroke="${P.ink}" stroke-width="${r2(lw * 2)}"/><circle cx="${r2(ft(5.25))}" cy="${r2(cy)}" r="${r2(Math.max(1.5, 0.75 * Math.min(u, v)))}" fill="none" stroke="${P.orange}" stroke-width="${r2(lw)}"/>`;
  };
  return `<rect x="${r2(x(0) + lw)}" y="${r2(y(0) + lw)}" width="${r2(x(94) - lw * 2)}" height="${r2(y(50) - lw * 2)}" ${L}/><path d="M${r2(x(47))} ${r2(y(0))}V${r2(y(50))}" ${L}/><ellipse cx="${r2(x(47))}" cy="${r2(cy)}" rx="${r2(6 * u)}" ry="${r2(6 * v)}" ${L}/>${end(1)}${end(-1)}`;
}, 94, 50);

const tennis = court((x, y, _u, _v, lw) => {
  const L = `fill="none" stroke="${LINE}" stroke-width="${r2(lw * 1.4)}"`;
  const x0 = x(21), x1 = x(99), sx0 = x(39), sx1 = x(81);
  return `<rect x="${r2(x0)}" y="${r2(y(12))}" width="${r2(x1 - x0)}" height="${r2(y(36))}" fill="#3f6fa6"/><rect x="${r2(x0)}" y="${r2(y(12))}" width="${r2(x1 - x0)}" height="${r2(y(36))}" ${L}/><path d="M${r2(x0)} ${r2(y(16.5))}H${r2(x1)}M${r2(x0)} ${r2(y(43.5))}H${r2(x1)}M${r2(sx0)} ${r2(y(16.5))}V${r2(y(43.5))}M${r2(sx1)} ${r2(y(16.5))}V${r2(y(43.5))}M${r2(sx0)} ${r2(y(30))}H${r2(sx1)}M${r2(x0)} ${r2(y(30))}h${r2(x(1))}M${r2(x1)} ${r2(y(30))}h${r2(-x(1))}" ${L}/><path d="M${r2(x(60))} ${r2(y(9))}V${r2(y(51))}" stroke="${P.ink}" stroke-width="${r2(lw * 2)}"/><circle cx="${r2(x(60))}" cy="${r2(y(9))}" r="${r2(lw * 1.6)}" fill="${P.steelDark}"/><circle cx="${r2(x(60))}" cy="${r2(y(51))}" r="${r2(lw * 1.6)}" fill="${P.steelDark}"/>`;
}, 120, 60);

const volleyball = court((x, y, _u, _v, lw) => {
  const L = `fill="none" stroke="${LINE}" stroke-width="${r2(lw * 1.4)}"`;
  const x0 = x(10.5), x1 = x(69.5), y0 = y(10.25), y1 = y(39.75);
  return `<rect x="${r2(x0)}" y="${r2(y0)}" width="${r2(x1 - x0)}" height="${r2(y1 - y0)}" fill="#e2a560"/><rect x="${r2(x0)}" y="${r2(y0)}" width="${r2(x1 - x0)}" height="${r2(y1 - y0)}" ${L}/><path d="M${r2(x(30.16))} ${r2(y0)}V${r2(y1)}M${r2(x(49.84))} ${r2(y0)}V${r2(y1)}" ${L}/><path d="M${r2(x(40))} ${r2(y(7))}V${r2(y(43))}" stroke="${P.ink}" stroke-width="${r2(lw * 2)}"/><circle cx="${r2(x(40))}" cy="${r2(y(7))}" r="${r2(lw * 1.6)}" fill="${P.steelDark}"/><circle cx="${r2(x(40))}" cy="${r2(y(43))}" r="${r2(lw * 1.6)}" fill="${P.steelDark}"/>`;
}, 80, 50);

/** 400 m track: eight lanes around a grass infield, start/finish line on the home straight. */
const track: DrawFn = (c) => {
  const t = Math.min(c.w, c.h) * 0.106;
  const rr = (inset: number, extra: string) =>
    `<rect x="${r2(inset)}" y="${r2(inset)}" width="${r2(Math.max(1, c.w - inset * 2))}" height="${r2(Math.max(1, c.h - inset * 2))}" rx="${r2(Math.max(0, Math.min(c.w, c.h) / 2 - inset))}" ${extra}/>`;
  let lanes = '';
  for (let i = 1; i < 8; i++) lanes += rr((t * i) / 8, `fill="none" stroke="${LINE}" stroke-width="1.2"`);
  const fx = c.w * 0.62;
  return `${rr(c.sw / 2, FS(c))}${lanes}${rr(t, `fill="${TURF}" stroke="${LINE}" stroke-width="1.5"`)}<path d="M${r2(fx)} ${r2(c.h - t)}V${r2(c.h - c.sw)}" stroke="${LINE}" stroke-width="3"/>`;
};

const pool: DrawFn = (c) => {
  const m = Math.min(c.w, c.h) * 0.12;
  const W = c.w - m * 2, H = c.h - m * 2;
  const n = Math.max(2, Math.round(H / 37.5));
  let lanes = '';
  for (let i = 1; i < n; i++) {
    const y = m + (H * i) / n;
    lanes += `<path d="M${r2(m + 4)} ${r2(y)}H${r2(m + W - 4)}" stroke="#ffffff" stroke-width="1.6" stroke-dasharray="3 3"/>`;
  }
  for (let i = 0; i < n; i++) {
    const y = m + (H * (i + 0.5)) / n;
    lanes += `<path d="M${r2(m + 12)} ${r2(y)}H${r2(m + W - 12)}M${r2(m + 12)} ${r2(y - 5)}v10M${r2(m + W - 12)} ${r2(y - 5)}v10" stroke="#1f4f8a" stroke-opacity="0.55" stroke-width="2"/>`;
  }
  return `<rect x="${r2(c.sw / 2)}" y="${r2(c.sw / 2)}" width="${r2(c.w - c.sw)}" height="${r2(c.h - c.sw)}" rx="3" fill="${P.concrete}" ${S(c)}/><rect x="${r2(m)}" y="${r2(m)}" width="${r2(W)}" height="${r2(H)}" rx="2" ${F(c)} stroke="${P.waterEdge}" stroke-width="2"/>${lanes}${[0.3, 0.7].map((f) => `<rect x="${r2(m - 7)}" y="${r2(m + H * f - 4)}" width="7" height="8" fill="${P.steel}" stroke="${P.inkSoft}" stroke-width="0.6"/>`).join('')}`;
};

/** Play area: safety surfacing with a play structure, slide, swings and a climber. */
const playground: DrawFn = (c) => {
  const k = Math.min(c.w / 300, c.h / 200);
  const ox = (c.w - 300 * k) / 2, oy = (c.h - 200 * k) / 2;
  const kit = `<g transform="translate(${r2(ox)} ${r2(oy)}) scale(${r2(k)})">${raisedShadow(40, 50, 70, 70, 2, 3)}<rect x="40" y="50" width="70" height="70" rx="2" fill="#d23a32" stroke="${P.ink}" stroke-width="1.2"/><rect x="48" y="58" width="54" height="54" fill="${P.wood}" stroke="${P.ink}" stroke-width="0.8"/><path d="M48 76h54M48 94h54" stroke="${P.ink}" stroke-opacity="0.35"/><path d="M110 74h46q12 0 12 12t-12 12h-46Z" fill="${P.safety}" stroke="${P.ink}" stroke-width="1.2"/><path d="M75 120v30" stroke="${P.ink}" stroke-width="1.2"/><rect x="62" y="120" width="26" height="30" fill="${P.info}" stroke="${P.ink}" stroke-width="1"/><path d="M62 128h26M62 136h26M62 144h26" stroke="#fff" stroke-width="1.2"/><path d="M190 30h90" stroke="${P.steelDark}" stroke-width="5" stroke-linecap="round"/><circle cx="190" cy="30" r="4" fill="${P.ink}"/><circle cx="280" cy="30" r="4" fill="${P.ink}"/>${[210, 235, 260].map((x) => `<rect x="${x - 7}" y="44" width="14" height="6" rx="2" fill="${P.ink}"/>`).join('')}${raisedShadow(205, 120, 54, 54, 27, 2)}<circle cx="232" cy="147" r="27" fill="none" stroke="${P.go}" stroke-width="3"/><path d="M205 147h54M232 120v54M213 128l38 38M251 128l-38 38" stroke="${P.go}" stroke-width="2"/></g>`;
  return `${boxRect(c, 10)}${kit}`;
};

/** Aluminum bleachers: stepped bench rows, the high side (with its rail) at the top. */
const bleacherRows = (x: number, y: number, w: number, h: number, flip = false) => {
  const n = Math.max(2, Math.floor(h / 11));
  let s = '';
  for (let i = 0; i < n; i++) {
    const yy = y + ((i + 0.5) * h) / n;
    s += `<rect x="${r2(x + 3)}" y="${r2(yy - 2)}" width="${r2(w - 6)}" height="4" rx="1" fill="#f3f5f7" stroke="${P.steelDark}" stroke-width="0.6"/>`;
  }
  const aisle = w > 120 ? along({ w, h, fill: '', fo: 1, stroke: '', sw: 0, label: '' }, 90, (ax) => `<rect x="${r2(x + ax - 5)}" y="${r2(y)}" width="10" height="${r2(h)}" fill="${P.concrete}"/><path d="M${r2(x + ax)} ${r2(y)}V${r2(y + h)}" stroke="${P.paintYellow}" stroke-width="1.2" stroke-dasharray="3 3"/>`, 45) : '';
  const rail = `<path d="M${r2(x)} ${r2(flip ? y + h - 1 : y + 1)}H${r2(x + w)}" stroke="${P.ink}" stroke-width="2"/>`;
  return s + aisle + rail;
};

const bleachers: DrawFn = (c) => `${raisedShadow(0, 0, c.w, c.h, 2, 3)}${boxRect(c, 2)}${bleacherRows(c.sw / 2, c.sw / 2, c.w - c.sw, c.h - c.sw)}`;

/** Stadium: a lined field between home and visitor stands, press box on the home side. */
const stadium: DrawFn = (c) => {
  const sh = c.h * 0.17, fx = c.w * 0.06, fy = sh + c.h * 0.05;
  const fw = c.w - fx * 2, fh = c.h - fy * 2;
  const stand = (y: number, flip: boolean) => `${raisedShadow(fx, y, fw, sh, 2, 3)}<rect x="${r2(fx)}" y="${r2(y)}" width="${r2(fw)}" height="${r2(sh)}" rx="2" fill="#c9ced6" stroke="${P.ink}" stroke-width="1.2"/>${bleacherRows(fx, y, fw, sh, flip)}`;
  const pb = Math.min(fw * 0.3, 260);
  return `${boxRect(c, 6)}<rect x="${r2(fx)}" y="${r2(fy)}" width="${r2(fw)}" height="${r2(fh)}" fill="${TURF}"/>${footballMarks(fx + fw * 0.03, fy + fh * 0.05, fw * 0.94, fh * 0.9)}${stand(c.h * 0.02, false)}${stand(c.h - sh - c.h * 0.02, true)}${raisedShadow(c.w / 2 - pb / 2, c.h * 0.005, pb, sh * 0.32, 2, 3)}<rect x="${r2(c.w / 2 - pb / 2)}" y="${r2(c.h * 0.005)}" width="${r2(pb)}" height="${r2(sh * 0.32)}" rx="2" fill="${P.roof}" stroke="${P.ink}" stroke-width="1.2"/>${text(c.w / 2, c.h * 0.005 + sh * 0.16, Math.min(sh * 0.16, fitText(pb * 0.8, 9, 40)), 'PRESS BOX', P.ink)}`;
};

const ATHLETICS = [
  sc('football-field', 'Football field', {
    layer: 'structure', width: 1800, height: 800, fill: TURF, stroke: P.foliageDark, strokeWidth: 1, labelPos: 'below',
    keywords: ['football', 'gridiron', 'field', 'sports', 'athletics', 'turf'], draw: football,
  }),
  sc('soccer-field', 'Soccer field', {
    layer: 'structure', width: 1650, height: 1050, fill: TURF, stroke: P.foliageDark, strokeWidth: 1, labelPos: 'below',
    keywords: ['soccer', 'football pitch', 'pitch', 'field', 'sports', 'athletics'], draw: soccer,
  }),
  sc('baseball-field', 'Baseball field', {
    layer: 'structure', width: 2390, height: 2170, fill: TURF, stroke: P.foliageDark, strokeWidth: 2, labelPos: 'below',
    keywords: ['baseball', 'diamond', 'ballfield', 'field', 'sports', 'athletics'],
    draw: diamondField({ bases: 90, mound: 60.5, pole: 330, center: 400, skin: 95, grassInfield: true }),
  }),
  sc('softball-field', 'Softball field', {
    layer: 'structure', width: 1590, height: 1270, fill: TURF, stroke: P.foliageDark, strokeWidth: 2, labelPos: 'below',
    keywords: ['softball', 'diamond', 'little league', 'field', 'sports', 'athletics'],
    draw: diamondField({ bases: 60, mound: 43, pole: 200, center: 220, skin: 60, grassInfield: false }),
  }),
  sc('basketball-court', 'Basketball court', {
    layer: 'structure', width: 470, height: 250, fill: '#d8a466', stroke: P.ink, strokeWidth: 1, labelPos: 'below',
    keywords: ['basketball', 'court', 'hoops', 'sports', 'athletics'], draw: basketball,
  }),
  sc('tennis-court', 'Tennis court', {
    layer: 'structure', width: 600, height: 300, fill: '#5b8f5a', stroke: P.ink, strokeWidth: 1, labelPos: 'below',
    keywords: ['tennis', 'court', 'pickleball', 'sports', 'athletics'], draw: tennis,
  }),
  sc('volleyball-court', 'Volleyball court', {
    layer: 'structure', width: 400, height: 250, fill: '#3f6fa6', stroke: P.ink, strokeWidth: 1, labelPos: 'below',
    keywords: ['volleyball', 'court', 'sand volleyball', 'sports', 'athletics'], draw: volleyball,
  }),
  sc('running-track', 'Running track', {
    layer: 'structure', width: 2900, height: 1520, fill: '#b5523b', stroke: '#7d3526', strokeWidth: 1.5, labelPos: 'below',
    keywords: ['track', 'oval', '400m', 'track and field', 'running', 'sports', 'athletics'], draw: track,
  }),
  sc('swimming-pool', 'Swimming pool', {
    layer: 'structure', width: 375, height: 225, fill: P.water, stroke: P.concreteEdge, strokeWidth: 1.5, labelPos: 'below',
    keywords: ['pool', 'swimming', 'natatorium', 'aquatics', 'lanes'], draw: pool,
  }),
  sc('playground', 'Playground', {
    layer: 'structure', width: 300, height: 200, fill: '#c98f5a', stroke: P.concreteEdge, strokeWidth: 3, labelPos: 'below',
    keywords: ['play area', 'play structure', 'swings', 'slide', 'recess', 'tot lot'], draw: playground,
  }),
  sc('bleachers', 'Bleachers', {
    layer: 'structure', width: 200, height: 75, fill: '#c9ced6', stroke: P.ink, strokeWidth: 1.2, labelPos: 'below',
    keywords: ['stands', 'grandstand', 'seating', 'spectators'], draw: bleachers,
  }),
  sc('stadium', 'Stadium', {
    layer: 'structure', width: 2000, height: 1400, fill: P.concrete, stroke: P.concreteEdge, strokeWidth: 2, labelPos: 'below',
    keywords: ['stadium', 'football stadium', 'arena', 'stands', 'press box', 'sports', 'athletics'], draw: stadium,
  }),
  zn('outdoor-rec-area', 'Outdoor recreational area', 'run', P.go, ['recreation', 'rec area', 'play field', 'recess', 'open space', 'green space'], 320, 200),
];

// ---------------------------------------------------------------- pedestrian areas (general, also listed for schools)

const pd = category('Pedestrian areas');

/** Pavers in a running bond, sized in feet so the joints stay even at any size. */
const pavers: DrawFn = (c) => {
  const b = badgeLayout(c.w, c.h);
  let d = '';
  for (let y = 10, row = 0; y < c.h; y += 10, row++) d += `M0 ${y}H${r2(c.w)}`;
  for (let y = 0, row = 0; y < c.h; y += 10, row++) for (let x = row % 2 ? 10 : 0; x < c.w; x += 20) d += `M${x} ${y}v10`;
  return `${boxRect(c)}<path d="${d}" stroke="${shade(c.fill, 0.14)}" stroke-width="0.6"/>${badgeFor(c, 'tree', b.cx, b.cy, b.r, P.go)}`;
};

const seating: DrawFn = (c) => {
  let t = '';
  for (let y = 26; y + 18 < c.h; y += 46) {
    for (let x = 20; x + 36 < c.w; x += 52) {
      t += `${raisedShadow(x + 3, y, 30, 12, 1.5, 1.5)}<rect x="${x + 3}" y="${y}" width="30" height="12" rx="1.5" fill="${P.wood}" stroke="${P.ink}" stroke-width="0.8"/><rect x="${x + 3}" y="${y - 7}" width="30" height="4" rx="1" fill="${shade(P.wood, 0.15)}" stroke="${P.ink}" stroke-width="0.6"/><rect x="${x + 3}" y="${y + 15}" width="30" height="4" rx="1" fill="${shade(P.wood, 0.15)}" stroke="${P.ink}" stroke-width="0.6"/>`;
    }
  }
  return `${boxRect(c, 4)}${t}`;
};

const ramp: DrawFn = (c) => {
  const land = Math.min(c.w * 0.14, 25);
  const chev = along({ ...c, w: c.w - land * 2 }, 22, (x) => `<path d="M${r2(land + x - 4)} ${r2(c.h * 0.3)} L${r2(land + x + 4)} ${r2(c.h / 2)} L${r2(land + x - 4)} ${r2(c.h * 0.7)}" fill="none" stroke="${P.accessible}" stroke-opacity="0.55" stroke-width="2" stroke-linejoin="round"/>`, 14);
  const s = Math.min(c.h * 0.6, 22);
  return `${boxRect(c)}<rect x="${r2(c.sw / 2)}" y="${r2(c.sw / 2)}" width="${r2(land)}" height="${r2(c.h - c.sw)}" fill="#ffffff" fill-opacity="0.35"/><rect x="${r2(c.w - land - c.sw / 2)}" y="${r2(c.sw / 2)}" width="${r2(land)}" height="${r2(c.h - c.sw)}" fill="#ffffff" fill-opacity="0.35"/>${chev}${hLine(2, land, c.w - land, P.steelDark, 2.2)}${hLine(c.h - 2, land, c.w - land, P.steelDark, 2.2)}<rect x="${r2(c.w / 2 - s / 2)}" y="${r2(c.h / 2 - s / 2)}" width="${r2(s)}" height="${r2(s)}" rx="2" fill="${P.accessible}"/>${glyph('wheelchair', c.w / 2, c.h / 2, s * 0.8, '#fff')}`;
};

const PEDESTRIAN = [
  pd('accessible-ramp', 'Accessible ramp', {
    also: ALSO, width: 180, height: 30, layer: 'structure', fill: P.concrete, stroke: P.concreteEdge, strokeWidth: 1.5, connector: true,
    keywords: ['ada ramp', 'wheelchair ramp', 'ramp', 'handrail', 'accessible'], draw: ramp,
  }),
  pd('courtyard', 'Courtyard', {
    also: ALSO, width: 300, height: 240, layer: 'structure', fill: '#d9cdb8', stroke: P.concreteEdge, strokeWidth: 2, label: 'Courtyard', labelPos: 'badge',
    keywords: ['quad', 'plaza', 'pavers', 'patio', 'commons'], draw: pavers,
  }),
  pd('outdoor-seating', 'Outdoor seating area', {
    also: ALSO, width: 220, height: 150, layer: 'structure', fill: P.concrete, stroke: P.concreteEdge, strokeWidth: 1.5,
    keywords: ['picnic tables', 'lunch tables', 'outdoor dining', 'benches', 'patio', 'seating'], draw: seating,
  }),
];

/** Open-sided roof seen from above: hip lines, the posts under it shown faintly, and a badge. */
const pavilion: DrawFn = (c) => {
  const posts = [[0.1, 0.12], [0.5, 0.12], [0.9, 0.12], [0.1, 0.88], [0.5, 0.88], [0.9, 0.88]]
    .map(([fx, fy]) => `<rect x="${r2(c.w * fx - 3)}" y="${r2(c.h * fy - 3)}" width="6" height="6" fill="${P.wall}" fill-opacity="0.55"/>`).join('');
  return `${building('pavilion', P.go)(c)}${posts}`;
};

// ---------------------------------------------------------------- safety, utilities, signs

const od = category('Outdoor environment');
const sg = category('Signs and safety');
const SIGN = { layer: 'labels' as const, width: 40, height: 46, strokeWidth: 1.2, labelPos: 'below' as const };

const bikeRack: DrawFn = (c) => {
  const hoops = along(c, 15, (x) => `<rect x="${r2(x - 1.6)}" y="${r2(c.h * 0.2)}" width="3.2" height="${r2(c.h * 0.6)}" rx="1.6" fill="${P.steelDark}" stroke="${P.ink}" stroke-width="0.6"/>`, 9);
  return `${boxRect(c, 2)}${hLine(c.h / 2, 6, c.w - 6, P.steel, 1)}${hoops}`;
};

const OTHER = [
  sc('covered-pavilion', 'Covered pavilion', {
    also: ['Outdoor environment'], layer: 'structure', width: 240, height: 160, fill: '#b98a5a', fillOpacity: 0.85, stroke: '#6f5233', strokeWidth: 2, label: 'Pavilion', labelPos: 'badge',
    keywords: ['pavilion', 'shelter', 'shade structure', 'gazebo', 'covered', 'outdoor classroom'], draw: pavilion,
  }),
  sg('emergency-access-point', 'Emergency vehicle access point', {
    ...SIGN, also: ALSO, fill: P.danger, stroke: P.ink, keywords: ['fire department', 'ambulance', 'knox box', 'emergency', 'access', 'sign'],
    draw: signRect({ bg: P.danger, fg: '#ffffff', lines: ['EMERGENCY', 'ACCESS'], glyph: 'truck' }),
  }),
  sc('emergency-access-road', 'Emergency access road', {
    also: ['Roads and traffic'], layer: 'structure', merge: 'road', blend: 6, width: 300, height: 100, fill: P.asphalt, stroke: P.asphaltEdge, strokeWidth: 0, labelColor: '#ffffff',
    keywords: ['fire access road', 'fire apparatus road', 'emergency', 'road', 'ambulance'],
    draw: lane((c) => `${hLine(8, 0, c.w, P.paintRed, 4)}${hLine(c.h - 8, 0, c.w, P.paintRed, 4)}${text(c.w / 2, c.h / 2, Math.min(c.h * 0.2, fitText(c.w * 0.8, 16, 16)), 'EMERGENCY ACCESS', P.paint)}`),
  }),
  sg('aed', 'AED location', {
    ...SIGN, also: ALSO, fill: P.go, stroke: P.ink, keywords: ['defibrillator', 'aed', 'heart', 'cardiac', 'medical', 'sign'],
    draw: signRect({ bg: P.go, fg: '#ffffff', lines: ['AED'], glyph: 'heart' }),
  }),
  sg('first-aid', 'First aid station', {
    ...SIGN, also: ALSO, fill: P.go, stroke: P.ink, keywords: ['first aid', 'medical', 'kit', 'nurse', 'sign'],
    draw: signRect({ bg: P.go, fg: '#ffffff', lines: ['FIRST AID'], glyph: 'cross' }),
  }),
  od('bike-rack', 'Bike rack', {
    also: ALSO, width: 120, height: 40, layer: 'landmarks', fill: '#e6e2d9', stroke: P.concreteEdge, strokeWidth: 1, labelPos: 'below',
    keywords: ['bicycle', 'bikes', 'bike parking', 'rack', 'scooter'], draw: bikeRack,
  }),
  od('generator', 'Generator', {
    also: ALSO, width: 60, height: 36, layer: 'landmarks', fill: '#7f8b7a', stroke: P.ink, strokeWidth: 1.2, labelPos: 'below',
    keywords: ['backup generator', 'standby power', 'genset', 'emergency power', 'utility'],
    draw: icon(64, 40, (c) => `<rect x="1" y="1" width="62" height="38" rx="2" fill="${P.concrete}" stroke="${P.concreteEdge}" stroke-width="1"/>${raisedShadow(6, 6, 52, 28, 2)}<rect x="6" y="6" width="52" height="28" rx="2" ${FS(c)}/>${[0, 1, 2, 3, 4].map((i) => `<path d="M${10 + i * 3} 10v20M${42 + i * 3} 10v20" stroke="${P.ink}" stroke-opacity="0.35" stroke-width="1"/>`).join('')}<circle cx="32" cy="12" r="3" fill="${P.ink}" fill-opacity="0.6"/>${glyph('bolt', 32, 24, 11, P.safety)}`),
  }),
  od('sewer-access', 'Sewer access', {
    also: ALSO, width: 24, height: 24, layer: 'structure', fill: '#5a6068', stroke: P.ink, strokeWidth: 1, labelPos: 'below',
    keywords: ['manhole', 'sewer', 'utility access', 'cleanout', 'lid'],
    draw: icon(24, 24, (c) => `<circle cx="12" cy="12" r="11" ${FS(c)}/><circle cx="12" cy="12" r="8" fill="none" stroke="#1b1f24" stroke-opacity="0.5" stroke-width="0.8"/><path d="M6 9.5h12M5 12h14M6 14.5h12M9.5 6v12M12 5v14M14.5 6v12" stroke="#1b1f24" stroke-opacity="0.45" stroke-width="0.7"/>`),
  }),
  sg('building-id-sign', 'Building identification sign', {
    ...SIGN, also: ALSO, fill: '#1f3a5f', stroke: P.ink, label: 'A', labelPos: 'inside', keywords: ['building sign', 'building letter', 'building number', 'wayfinding', 'sign'],
    draw: icon(56, 64, (c) => {
      const t = (c.label || 'A').toUpperCase();
      return `<rect x="26.5" y="48" width="3" height="14" fill="${P.steelDark}"/><rect x="5" y="5.5" width="48" height="44" rx="4" fill="${P.shadow}"/><rect x="4" y="4" width="48" height="44" rx="4" ${FS(c)}/>${text(28, 13, 6.5, 'BUILDING', '#ffffff')}${text(28, 31, fitText(40, t.length, 22), t, '#ffffff')}`;
    }),
  }),
  sg('campus-directory', 'Campus directory sign', {
    ...SIGN, also: ALSO, width: 70, height: 50, fill: '#1f3a5f', stroke: P.ink, keywords: ['directory', 'map board', 'kiosk', 'you are here', 'wayfinding', 'sign'],
    draw: icon(70, 50, (c) => `<rect x="10" y="40" width="3" height="10" fill="${P.steelDark}"/><rect x="57" y="40" width="3" height="10" fill="${P.steelDark}"/><rect x="4" y="3.5" width="64" height="38" rx="3" fill="${P.shadow}"/><rect x="3" y="2" width="64" height="38" rx="3" ${FS(c)}/>${text(35, 8, 5.5, 'CAMPUS DIRECTORY', '#ffffff')}<rect x="7" y="12" width="56" height="24" rx="1" fill="#f4f1ea"/><rect x="10" y="15" width="16" height="8" fill="${P.roof}" stroke="${P.inkSoft}" stroke-width="0.5"/><rect x="29" y="15" width="12" height="16" fill="${P.roof}" stroke="${P.inkSoft}" stroke-width="0.5"/><rect x="44" y="15" width="16" height="8" fill="${P.roof}" stroke="${P.inkSoft}" stroke-width="0.5"/><rect x="44" y="26" width="16" height="7" fill="${P.grass}"/><path d="M10 27h16" stroke="${P.steel}" stroke-width="2"/><circle cx="20" cy="31" r="2.2" fill="${P.danger}"/>`),
  }),
];

export const SCHOOLS = [...BUILDINGS, ...ENTRANCES,
  sc('access-gate', 'Access-controlled gate', {
    also: ['Structural objects'], width: 130, height: 46, layer: 'structure', fill: P.steelDark, stroke: P.ink, strokeWidth: 1.2, labelPos: 'below',
    keywords: ['gate', 'card reader', 'keypad', 'sliding gate', 'security', 'controlled access', 'fob'], draw: accessGate,
  }),
  ...TRANSPORT, ...ATHLETICS, ...PEDESTRIAN, ...OTHER];
