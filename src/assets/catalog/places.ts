import { category } from '../defs';
import { along, badge, bay, building, hLine, raisedShadow, room, zone } from '../draw';
import { glyph } from '../glyphs';
import { boxRect, F, FS, fitText, icon, P, r2, S, text, type DrawCtx } from '../style';

// ---------------------------------------------------------------- pedestrian

const pd = category('Pedestrian areas');
const ZONE = { layer: 'structure' as const, fillOpacity: 0.16, strokeWidth: 2, labelPos: 'badge' as const, dashed: true };
const z = (cat: ReturnType<typeof category>, key: string, name: string, g: string, color: string, extra: object = {}) =>
  cat(key, name, { ...ZONE, draw: zone({ glyph: g }), width: 200, height: 120, fill: color, stroke: color, label: name, ...extra });

const doorIcon = (arrowColor: string, out: boolean) => icon(80, 44, (c) => {
  const arrow = out
    ? `<path d="M40 20v-14M33 12l7-7 7 7" fill="none" stroke="${arrowColor}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`
    : `<path d="M40 4v14M33 12l7 7 7-7" fill="none" stroke="${arrowColor}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`;
  return `<rect x="0" y="22" width="20" height="6" fill="${P.wall}"/><rect x="60" y="22" width="20" height="6" fill="${P.wall}"/><path d="M20 25 A20 20 0 0 1 40 45" fill="none" stroke="${P.inkSoft}" stroke-width="0.8" stroke-dasharray="2 2"/><path d="M60 25 A20 20 0 0 0 40 45" fill="none" stroke="${P.inkSoft}" stroke-width="0.8" stroke-dasharray="2 2"/><rect x="20" y="23" width="40" height="4" ${FS(c)}/>${arrow}${glyph('walk', 62, 10, 13, arrowColor)}`;
});

export const PEDESTRIAN = [
  pd('sidewalk', 'Sidewalk', {
    width: 240, height: 30, layer: 'structure', fill: P.concrete, stroke: P.concreteEdge, strokeWidth: 1.5, keywords: ['walk', 'pavement', 'footway'],
    draw: (c) => `${boxRect(c)}${along(c, 30, (x) => `<path d="M${r2(x)} 0 V${c.h}" stroke="${P.concreteEdge}" stroke-width="0.8"/>`, 15)}`,
  }),
  pd('walkway', 'Pedestrian walkway', {
    width: 240, height: 40, layer: 'structure', fill: '#f4ecd2', stroke: P.paintYellow, strokeWidth: 3, connector: true, keywords: ['walk', 'path', 'painted walkway'],
    draw: (c) => `${boxRect(c)}${along(c, 70, (x) => glyph('walk', x, c.h / 2, Math.min(c.h * 0.6, 22), '#9a7b12'))}`,
  }),
  pd('crosswalk', 'Crosswalk', {
    width: 120, height: 60, layer: 'structure', fill: P.asphalt, stroke: P.paint, strokeWidth: 0, keywords: ['zebra', 'crossing', 'continental'],
    draw: (c) => `<rect width="${c.w}" height="${c.h}" ${F(c)}/>${along(c, 14, (x) => `<rect x="${r2(x - 4)}" y="3" width="8" height="${c.h - 6}" fill="${P.paint}"/>`, 7)}`,
  }),
  pd('pedestrian-crossing', 'Pedestrian crossing', {
    width: 120, height: 60, layer: 'structure', fill: P.asphalt, stroke: P.paint, strokeWidth: 3, keywords: ['ladder', 'crossing', 'school'],
    draw: (c) => `<rect width="${c.w}" height="${c.h}" ${F(c)}/>${hLine(c.sw / 2 + 2, 0, c.w, c.stroke, c.sw)}${hLine(c.h - c.sw / 2 - 2, 0, c.w, c.stroke, c.sw)}${along(c, 20, (x) => `<rect x="${r2(x - 4)}" y="${r2(c.sw + 6)}" width="8" height="${r2(c.h - c.sw * 2 - 12)}" fill="${P.paint}" fill-opacity="0.85"/>`, 10)}`,
  }),
  pd('ped-entrance', 'Pedestrian entrance', { draw: doorIcon(P.go, false), width: 80, height: 44, layer: 'landmarks', fill: '#cfe3f0', stroke: P.ink, strokeWidth: 1, keywords: ['entry', 'walk in', 'door'], labelPos: 'below' }),
  pd('ped-exit', 'Pedestrian exit', { draw: doorIcon(P.danger, true), width: 80, height: 44, layer: 'landmarks', fill: '#cfe3f0', stroke: P.ink, strokeWidth: 1, keywords: ['exit', 'walk out', 'door'], labelPos: 'below' }),
  pd('safety-island', 'Safety island', {
    width: 140, height: 36, layer: 'structure', fill: P.concrete, stroke: P.concreteEdge, strokeWidth: 2, keywords: ['refuge', 'median', 'pedestrian island'],
    draw: (c) => `<rect x="${c.sw / 2}" y="${c.sw / 2}" width="${c.w - c.sw}" height="${c.h - c.sw}" rx="${r2((c.h - c.sw) / 2)}" ${FS(c)}/><path d="M${r2(c.h / 2)} ${r2(c.sw + 1)} A${r2(c.h / 2 - c.sw)} ${r2(c.h / 2 - c.sw)} 0 0 0 ${r2(c.h / 2)} ${r2(c.h - c.sw - 1)}" fill="none" stroke="${P.paintYellow}" stroke-width="3"/>${glyph('walk', c.w / 2, c.h / 2, c.h * 0.6, P.inkSoft)}`,
  }),
  z(pd, 'ped-only-zone', 'Pedestrian-only zone', 'walk', P.teal, { also: ['Zones and boundaries'], keywords: ['no vehicles', 'plaza', 'walk only'] }),
  z(pd, 'waiting-area', 'Waiting area', 'clock', P.info, { keywords: ['wait', 'bench', 'seating'] }),
  pd('lobby-entrance', 'Lobby entrance', {
    width: 90, height: 40, layer: 'landmarks', fill: '#cfe3f0', stroke: P.ink, strokeWidth: 1, keywords: ['lobby', 'front door', 'glass doors', 'hotel'], labelPos: 'below',
    draw: icon(90, 40, (c) => `<rect x="0" y="4" width="22" height="7" fill="${P.wall}"/><rect x="68" y="4" width="22" height="7" fill="${P.wall}"/><rect x="22" y="5" width="23" height="5" ${FS(c)}/><rect x="45" y="5" width="23" height="5" ${FS(c)}/><path d="M45 5v5" stroke="${P.ink}" stroke-width="1"/><path d="M45 15v20M39 29l6 6 6-6" fill="none" stroke="${P.go}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`),
  }),
  pd('building-entrance', 'Building entrance', {
    width: 70, height: 44, layer: 'landmarks', fill: '#b98a5a', stroke: P.ink, strokeWidth: 1, keywords: ['front door', 'entry', 'main door'], labelPos: 'below',
    draw: icon(70, 44, (c) => `<rect x="10" y="0" width="50" height="14" fill="${P.roof}" stroke="${P.inkSoft}" stroke-width="0.8" stroke-dasharray="3 2"/><rect x="0" y="4" width="22" height="7" fill="${P.wall}"/><rect x="48" y="4" width="22" height="7" fill="${P.wall}"/><rect x="22" y="5.5" width="26" height="4" ${FS(c)}/><path d="M22 9.5 A26 26 0 0 0 48 35" fill="none" stroke="${P.inkSoft}" stroke-width="0.8" stroke-dasharray="2 2"/><path d="M35 40V20M29 26l6-6 6 6" fill="none" stroke="${P.go}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`),
  }),
  pd('footpath', 'Outdoor footpath', {
    width: 240, height: 24, layer: 'structure', fill: P.gravel, stroke: '#a89f8c', strokeWidth: 1, keywords: ['trail', 'path', 'garden path'],
    draw: (c) => {
      let dots = '';
      for (let x = 6; x < c.w - 4; x += 9) dots += `<circle cx="${r2(x + ((x * 7) % 5))}" cy="${r2(c.h * (0.3 + ((x * 13) % 40) / 100))}" r="1.3" fill="#a89f8c"/>`;
      return `<rect x="${c.sw / 2}" y="${c.sw / 2}" width="${c.w - c.sw}" height="${c.h - c.sw}" rx="${r2(c.h / 2)}" ${FS(c)}/>${dots}`;
    },
  }),
  pd('accessible-route', 'Accessible pedestrian route', {
    width: 240, height: 30, layer: 'structure', fill: '#dbe6f7', stroke: P.accessible, strokeWidth: 2, keywords: ['ada route', 'accessible path', 'wheelchair'],
    draw: (c) => `${boxRect(c)}${along(c, 80, (x) => `<rect x="${r2(x - c.h * 0.3)}" y="${r2(c.h * 0.2)}" width="${r2(c.h * 0.6)}" height="${r2(c.h * 0.6)}" rx="2" fill="${P.accessible}"/>${glyph('wheelchair', x, c.h / 2, c.h * 0.5, '#fff')}`)}`,
  }),
  pd('pedestrian-bridge', 'Pedestrian bridge', {
    width: 240, height: 50, layer: 'structure', fill: '#d8d2c4', stroke: P.ink, strokeWidth: 1.2, connector: true, keywords: ['skybridge', 'skywalk', 'overpass'],
    draw: (c) => `${raisedShadow(0, 0, c.w, c.h, 0, 3)}${boxRect(c)}<rect x="0" y="0" width="${c.w}" height="5" fill="${P.steelDark}"/><rect x="0" y="${c.h - 5}" width="${c.w}" height="5" fill="${P.steelDark}"/>${along(c, 20, (x) => `<path d="M${r2(x)} 5 V${c.h - 5}" stroke="${P.concreteEdge}" stroke-width="0.8"/>`, 10)}`,
  }),
];

// ---------------------------------------------------------------- garage access

const ga = category('Garage access');
const CONNECT = { layer: 'landmarks' as const, connector: true, labelPos: 'below' as const };

const treads = (x: number, y: number, w: number, h: number, step = 8) =>
  Array.from({ length: Math.max(1, Math.floor(h / step)) }, (_, i) => `<path d="M${r2(x)} ${r2(y + i * step)} h${r2(w)}" stroke="${P.ink}" stroke-opacity="0.55" stroke-width="1"/>`).join('');

const elevatorCar = (x: number, y: number, s: number, c: DrawCtx) =>
  `<rect x="${r2(x)}" y="${r2(y)}" width="${r2(s)}" height="${r2(s)}" ${FS(c)}/><path d="M${r2(x)} ${r2(y)} L${r2(x + s)} ${r2(y + s)} M${r2(x + s)} ${r2(y)} L${r2(x)} ${r2(y + s)}" stroke="${P.ink}" stroke-opacity="0.35" stroke-width="1"/><rect x="${r2(x + s * 0.2)}" y="${r2(y + s - 2.5)}" width="${r2(s * 0.6)}" height="5" fill="${P.steel}" stroke="${P.ink}" stroke-width="0.8"/>`;

const levelBadge = (dir: 'up' | 'down' | 'both') => icon(44, 44, (c) => {
  const g = dir === 'up' ? 'up' : dir === 'down' ? 'down' : 'upDown';
  return `<rect x="3.5" y="4" width="38" height="38" rx="6" fill="${P.shadow}"/><rect x="2" y="2" width="38" height="38" rx="6" ${FS(c)}/>${glyph(g, 21, 16, 20, '#fff')}${text(21, 32, 8, dir === 'up' ? 'UP' : dir === 'down' ? 'DOWN' : 'FLOORS', '#fff')}`;
});

/** A gap in a wall: the wall runs along the top edge and the arrow points into (ENTER) or out of (EXIT) the area below it. The tag turns to stay readable when the opening is turned upside down. */
const garageOpening = (inbound: boolean) => icon(120, 44, (c) => `<rect x="0" y="0" width="14" height="10" fill="${P.wall}"/><rect x="106" y="0" width="14" height="10" fill="${P.wall}"/><rect x="14" y="0" width="92" height="44" fill="${c.fill}" fill-opacity="${Math.min(c.fo, 0.22)}"/><path d="M14 2H106" stroke="${P.inkSoft}" stroke-width="1" stroke-dasharray="4 3"/>${inbound ? `<path d="M42 14v24M32 28l10 10 10-10" fill="none" stroke="${c.fill}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>` : `<path d="M42 38V14M32 24l10-10 10 10" fill="none" stroke="${c.fill}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`}<g${c.upsideDown ? ' transform="rotate(180 76 26)"' : ''}><rect x="60" y="19.5" width="32" height="13" rx="2" ${FS(c)}/>${text(76, 26.3, 7, inbound ? 'ENTER' : 'EXIT', '#fff')}</g>`);

export const GARAGE = [
  ga('stairs', 'Staircase', {
    ...CONNECT, namePrefix: 'Stairway', width: 50, height: 100, fill: '#e6e1d6', stroke: P.ink, strokeWidth: 1.2, keywords: ['stairs', 'steps', 'stairway'],
    draw: (c) => `${boxRect(c)}${treads(0, 6, c.w, c.h - 6)}<path d="M${r2(c.w / 2)} ${r2(c.h - 8)} V12 M${r2(c.w / 2 - 6)} 18 L${r2(c.w / 2)} 12 L${r2(c.w / 2 + 6)} 18" fill="none" stroke="${P.ink}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
  }),
  ga('stairwell', 'Stairwell', {
    ...CONNECT, width: 110, height: 110, fill: '#e6e1d6', stroke: P.wall, strokeWidth: 3, keywords: ['stair tower', 'stair core', 'fire stairs'], label: 'Stairs', labelPos: 'center',
    draw: (c) => {
      const pad = c.sw + 2, fw = (c.w - pad * 2) / 2 - 2, land = (c.h - pad * 2) * 0.28;
      return `${boxRect(c)}${treads(pad, pad + land, fw, c.h - pad * 2 - land)}${treads(c.w / 2 + 2, pad + land, fw, c.h - pad * 2 - land)}<path d="M${r2(c.w / 2)} ${r2(pad + land)} V${r2(c.h - pad)}" stroke="${P.wall}" stroke-width="2"/><path d="M${r2(pad + fw / 2)} ${r2(c.h - pad - 4)} V${r2(pad + land * 0.5)} H${r2(c.w - pad - fw / 2)} V${r2(c.h - pad - 10)}" fill="none" stroke="${P.ink}" stroke-width="1.4" stroke-dasharray="3 2"/><path d="M${r2(c.w - pad - fw / 2 - 4)} ${r2(c.h - pad - 14)} l4 5 4 -5" fill="none" stroke="${P.ink}" stroke-width="1.4"/>`;
    },
  }),
  ga('elevator', 'Elevator', {
    ...CONNECT, width: 54, height: 54, fill: '#dfe3ea', stroke: P.ink, strokeWidth: 1.5, keywords: ['lift'],
    draw: icon(54, 54, (c) => `${raisedShadow(3, 3, 48, 46, 1)}${elevatorCar(3, 3, 46, c)}${glyph('elevator', 27, 24, 18, P.violet)}`),
  }),
  ga('elevator-bank', 'Elevator bank', {
    ...CONNECT, width: 150, height: 56, fill: '#dfe3ea', stroke: P.ink, strokeWidth: 1.5, keywords: ['lifts', 'elevators'],
    draw: icon(150, 56, (c) => `${[0, 1, 2].map((i) => elevatorCar(4 + i * 48, 4, 44, c)).join('')}${[0, 1, 2].map((i) => glyph('elevator', 26 + i * 48, 24, 14, P.violet)).join('')}`),
  }),
  ga('escalator', 'Escalator', {
    ...CONNECT, width: 36, height: 120, fill: '#d3d8de', stroke: P.ink, strokeWidth: 1.2, keywords: ['moving stairs'],
    draw: (c) => `${boxRect(c, 2)}<rect x="0" y="0" width="5" height="${c.h}" fill="${P.ink}" fill-opacity="0.7"/><rect x="${c.w - 5}" y="0" width="5" height="${c.h}" fill="${P.ink}" fill-opacity="0.7"/>${treads(5, 14, c.w - 10, c.h - 28, 5)}<path d="M${r2(c.w / 2)} ${r2(c.h - 18)} V${r2(c.h * 0.2)} M${r2(c.w / 2 - 7)} ${r2(c.h * 0.2 + 8)} L${r2(c.w / 2)} ${r2(c.h * 0.2)} L${r2(c.w / 2 + 7)} ${r2(c.h * 0.2 + 8)}" fill="none" stroke="${P.info}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`,
  }),
  ga('elevator-lobby', 'Elevator lobby', {
    layer: 'structure', width: 170, height: 110, fill: P.room, stroke: P.wall, strokeWidth: 3, keywords: ['lift lobby', 'core'], label: 'Elevator lobby', labelPos: 'center', connector: true,
    draw: (c) => `${boxRect(c)}${[0, 1].map((i) => elevatorCar(c.w / 2 - 50 + i * 54, c.sw, 46, { ...c, fill: '#dfe3ea', fo: 1, stroke: P.ink, sw: 1.2 })).join('')}`,
  }),
  ga('vehicle-ramp', 'Vehicle ramp', {
    layer: 'structure', width: 240, height: 70, fill: '#9aa0a8', stroke: P.wall, strokeWidth: 1.5, connector: true, keywords: ['ramp', 'incline', 'helix'],
    draw: (c) => `${boxRect(c)}<rect x="0" y="0" width="${c.w}" height="4" fill="${P.wall}"/><rect x="0" y="${c.h - 4}" width="${c.w}" height="4" fill="${P.wall}"/>${along(c, 30, (x) => `<path d="M${r2(x - 6)} ${r2(c.h * 0.25)} L${r2(x + 6)} ${r2(c.h / 2)} L${r2(x - 6)} ${r2(c.h * 0.75)}" fill="none" stroke="#fff" stroke-opacity="0.75" stroke-width="3"/>`, 20)}`,
  }),
  ga('level-up', 'Up-to-next-floor indicator', { ...CONNECT, draw: levelBadge('up'), width: 40, height: 40, fill: P.go, stroke: '#145c33', strokeWidth: 1, keywords: ['up', 'next level', 'upstairs'] }),
  ga('level-down', 'Down-to-next-floor indicator', { ...CONNECT, draw: levelBadge('down'), width: 40, height: 40, fill: P.info, stroke: '#163f80', strokeWidth: 1, keywords: ['down', 'lower level', 'downstairs'] }),
  ga('floor-connection', 'Floor connection', { ...CONNECT, draw: levelBadge('both'), width: 40, height: 40, fill: P.violet, stroke: '#4a3180', strokeWidth: 1, keywords: ['link', 'connects', 'levels', 'transfer'] }),
  ga('entrance', 'Garage entrance', { draw: garageOpening(true), width: 120, height: 44, layer: 'landmarks', fill: P.go, stroke: '#145c33', strokeWidth: 0.8, keywords: ['entry', 'in', 'enter', 'garage'], labelPos: 'below' }),
  ga('exit', 'Garage exit', { draw: garageOpening(false), width: 120, height: 44, layer: 'landmarks', fill: P.danger, stroke: '#8a1f1a', strokeWidth: 0.8, keywords: ['exit', 'out', 'leave', 'egress'], labelPos: 'below' }),
  ga('floor-marker', 'Floor designation marker', {
    width: 48, height: 48, layer: 'labels', fill: '#c8102e', stroke: '#ffffff', strokeWidth: 2, keywords: ['level', 'floor', 'p1', 'deck'], label: 'P1', labelPos: 'inside',
    draw: icon(48, 48, (c) => `<rect x="3.5" y="4" width="42" height="42" rx="7" fill="${P.shadow}"/><rect x="2" y="2" width="42" height="42" rx="7" ${F(c)}/><rect x="5" y="5" width="36" height="36" rx="5" fill="none" ${S(c)}/>${text(23, 24, fitText(32, (c.label || 'P1').length, 22), c.label || 'P1', '#fff')}`),
  }),
];

// ---------------------------------------------------------------- buildings & departments

const bd = category('Buildings and departments');
const BLD = { enterable: true, layer: 'structure' as const, fill: P.building, stroke: P.wall, strokeWidth: 2.5, labelPos: 'badge' as const, width: 280, height: 180 };
const RM = { enterable: true, layer: 'structure' as const, fill: P.room, stroke: P.wall, strokeWidth: 3, labelPos: 'badge' as const, width: 160, height: 110 };
const b = (key: string, name: string, g: string, color: string, keywords: string[] = []) => bd(key, name, { ...BLD, draw: building(g, color), label: name, keywords: ['building', ...keywords] });
const r = (key: string, name: string, g: string, color: string, keywords: string[] = [], size: Partial<typeof RM> = {}) =>
  bd(key, name, { ...RM, ...size, draw: room(g, color), label: name, keywords: ['room', 'department', ...keywords] });

const desk = (g: string, color: string, curved = false) => icon(70, 44, (c) => {
  const top = curved ? `<path d="M4 8 Q35 -2 66 8 V22 Q35 12 4 22 Z" ${FS(c)}/>` : `<path d="M4 6H66V20H18V36H4Z" ${FS(c)}/>`;
  return `${raisedShadow(4, 6, 62, 16, 2)}${top}<circle cx="${curved ? 35 : 40}" cy="${curved ? 31 : 31}" r="6" fill="${P.steel}" stroke="${P.ink}" stroke-width="1"/>${badge(g, curved ? 35 : 52, curved ? 11.5 : 13, 5.5, color)}`;
});

export const BUILDINGS = [
  b('building', 'Main building', 'building', P.inkSoft, ['main', 'hq']),
  b('dealership-building', 'Dealership building', 'showroom', P.info, ['dealer', 'car dealership']),
  b('hotel', 'Hotel', 'bed', P.violet, ['lodging', 'inn', 'resort']),
  b('restaurant', 'Restaurant', 'dine', P.orange, ['dining', 'food', 'cafe']),
  b('office-building', 'Office', 'briefcase', P.inkSoft, ['office building', 'corporate']),
  b('retail-store', 'Retail store', 'bag', P.teal, ['shop', 'store', 'mall']),
  b('event-venue', 'Event venue', 'ticket', P.danger, ['arena', 'stadium', 'hall', 'venue']),
  r('showroom', 'Showroom', 'showroom', P.info, ['display', 'new cars'], { width: 240, height: 160 }),
  r('sales-department', 'Sales department', 'handshake', P.info, ['sales']),
  r('finance-office', 'Finance office', 'dollar', P.go, ['f&i', 'business office']),
  r('service-department', 'Service department', 'wrench', P.orange, ['service'], { width: 220, height: 140 }),
  r('parts-department', 'Parts department', 'box', '#8a5a2b', ['parts counter']),
  r('customer-lounge', 'Customer lounge', 'coffee', P.teal, ['lounge', 'waiting']),
  r('reception-area', 'Reception area', 'bell', P.violet, ['front desk']),
  r('sales-office', 'Sales office', 'briefcase', P.info, ['manager', 'desk']),
  r('admin-office', 'Administration office', 'clipboard', P.inkSoft, ['admin', 'accounting', 'back office']),
  r('customer-waiting-room', 'Customer waiting room', 'sofa', P.teal, ['waiting room']),
  r('vehicle-delivery-room', 'Vehicle delivery room', 'key', P.go, ['delivery', 'handover'], { width: 200, height: 140 }),
  r('parts-warehouse', 'Parts warehouse', 'storage', '#8a5a2b', ['warehouse', 'shelving'], { width: 240, height: 160 }),
  r('break-room', 'Employee break room', 'coffee', P.inkSoft, ['break room', 'staff room', 'kitchen']),
  r('lobby', 'Lobby', 'door', P.violet, ['foyer', 'entry hall']),
  bd('reception-desk', 'Reception desk', { draw: desk('bell', P.violet, true), width: 70, height: 44, layer: 'landmarks', fill: P.wood, stroke: P.ink, strokeWidth: 1, keywords: ['front desk', 'check in', 'counter'], labelPos: 'below' }),
  bd('security-desk', 'Security desk', { draw: desk('shield', P.info), width: 70, height: 44, layer: 'landmarks', fill: '#5a6b80', stroke: P.ink, strokeWidth: 1, keywords: ['guard', 'security'], labelPos: 'below' }),
  bd('pay-station', 'Ticket booth', {
    width: 50, height: 50, layer: 'landmarks', fill: '#e8edf3', stroke: P.ink, strokeWidth: 1.2, keywords: ['ticket', 'cashier', 'pay', 'booth', 'kiosk'], labelPos: 'below',
    draw: icon(50, 50, (c) => `${raisedShadow(4, 4, 42, 42, 3, 2)}<rect x="4" y="4" width="42" height="42" rx="3" ${FS(c)}/><rect x="4" y="38" width="42" height="8" fill="${P.glass}" stroke="${P.glassDark}" stroke-width="0.8"/><rect x="10" y="10" width="30" height="10" rx="1.5" fill="${P.wood}"/>${badge('ticket', 25, 28, 7, P.info)}`),
  }),
  r('parking-office', 'Parking office', 'car', P.info, ['parking', 'garage office', 'cashier']),
  r('restroom', 'Restroom', 'restroom', P.info, ['bathroom', 'toilet', 'wc'], { width: 120, height: 100 }),
  r('restroom-men', "Men's restroom", 'man', P.info, ['bathroom', 'toilet', 'men', 'mens'], { width: 120, height: 100 }),
  r('restroom-women', "Women's restroom", 'woman', '#b03a72', ['bathroom', 'toilet', 'women', 'womens', 'ladies'], { width: 120, height: 100 }),
  r('restroom-accessible', 'Accessible restroom', 'wheelchair', P.accessible, ['ada', 'bathroom', 'toilet', 'family'], { width: 120, height: 100 }),
  bd('info-desk', 'Information desk', {
    width: 56, height: 56, layer: 'landmarks', fill: P.wood, stroke: P.ink, strokeWidth: 1, keywords: ['info', 'help', 'concierge'], labelPos: 'below',
    draw: icon(56, 56, (c) => `<circle cx="29.5" cy="30" r="24" fill="${P.shadow}"/><circle cx="28" cy="28" r="24" ${FS(c)}/><circle cx="28" cy="28" r="15" fill="#fff"/>${glyph('info', 28, 28, 24, P.info)}`),
  }),
];

// ---------------------------------------------------------------- service & preparation

const sv = category('Service and preparation');
const BAY = { layer: 'structure' as const, fill: '#e3e0da', stroke: P.wall, strokeWidth: 2, labelPos: 'badge' as const, width: 80, height: 130 };
const bayDef = (key: string, name: string, g: string, keywords: string[] = [], extra?: (c: DrawCtx) => string) =>
  sv(key, name, { ...BAY, draw: bay(g, extra), label: name.replace(/ bay$/i, ''), keywords: ['bay', 'service', 'shop', ...keywords] });
const svZone = (key: string, name: string, g: string, color: string, keywords: string[] = [], w = 220, h = 130) =>
  sv(key, name, { ...ZONE, draw: zone({ glyph: g }), width: w, height: h, fill: color, stroke: color, label: name.replace(/^Vehicle /, ''), keywords: ['area', ...keywords] });

const liftArms = (c: DrawCtx) => `<rect x="${r2(c.w * 0.12)}" y="${r2(c.h * 0.42)}" width="8" height="12" fill="${P.steelDark}"/><rect x="${r2(c.w * 0.88 - 8)}" y="${r2(c.h * 0.42)}" width="8" height="12" fill="${P.steelDark}"/>`;

export const SERVICE = [
  bayDef('service-bay', 'Service bay', 'wrench'),
  bayDef('inspection-bay', 'Vehicle inspection bay', 'clipboard', ['inspection', 'state inspection', 'emissions']),
  sv('vehicle-lift', 'Vehicle lift', {
    width: 80, height: 120, layer: 'landmarks', fill: P.safety, stroke: P.ink, strokeWidth: 1.2, keywords: ['hoist', 'two post', 'lift', 'rack'], labelPos: 'below',
    draw: icon(80, 120, (c) => `<rect x="18" y="20" width="44" height="80" rx="3" fill="none" stroke="${P.inkSoft}" stroke-width="1" stroke-dasharray="4 3"/>${[[4, 50], [62, 50]].map(([x, y]) => `${raisedShadow(x, y, 14, 20, 2)}<rect x="${x}" y="${y}" width="14" height="20" rx="2" ${FS(c)}/>`).join('')}<path d="M18 56 32 36M18 64 32 84M62 56 48 36M62 64 48 84" stroke="${P.steelDark}" stroke-width="3.5" stroke-linecap="round"/><circle cx="32" cy="36" r="3" fill="${P.ink}"/><circle cx="32" cy="84" r="3" fill="${P.ink}"/><circle cx="48" cy="36" r="3" fill="${P.ink}"/><circle cx="48" cy="84" r="3" fill="${P.ink}"/>`),
  }),
  bayDef('repair-bay', 'Repair bay', 'wrench', ['mechanical', 'repair'], liftArms),
  bayDef('oil-change-bay', 'Oil change bay', 'oil', ['lube', 'quick lube', 'pit'], (c) => `<rect x="${r2(c.w * 0.35)}" y="${r2(c.h * 0.1)}" width="${r2(c.w * 0.3)}" height="${r2(c.h * 0.7)}" fill="${P.ink}" fill-opacity="0.35" stroke="${P.ink}" stroke-width="1"/>`),
  bayDef('tire-bay', 'Tire service bay', 'tire', ['tires', 'tyre', 'wheels']),
  bayDef('alignment-bay', 'Wheel alignment bay', 'align', ['alignment', 'rack'], (c) => `<rect x="${r2(c.w * 0.18)}" y="${r2(c.h * 0.1)}" width="${r2(c.w * 0.16)}" height="${r2(c.h * 0.75)}" fill="${P.steel}" stroke="${P.ink}" stroke-width="0.8"/><rect x="${r2(c.w * 0.66)}" y="${r2(c.h * 0.1)}" width="${r2(c.w * 0.16)}" height="${r2(c.h * 0.75)}" fill="${P.steel}" stroke="${P.ink}" stroke-width="0.8"/>`),
  bayDef('detailing-bay', 'Detailing bay', 'sparkle', ['detail', 'polish', 'recon']),
  bayDef('wash-bay', 'Vehicle wash bay', 'wash', ['car wash', 'wash'], (c) => `<rect x="${r2(c.w * 0.45)}" y="${r2(c.h * 0.8)}" width="${r2(c.w * 0.1)}" height="4" fill="${P.ink}"/>${hLine(c.h * 0.82, c.w * 0.3, c.w * 0.7, P.waterEdge, 1, '2 2')}`),
  svZone('washing-area', 'Vehicle washing area', 'wash', P.waterEdge, ['wash', 'rinse']),
  svZone('detailing-area', 'Vehicle detailing area', 'sparkle', P.violet, ['detail', 'recon']),
  sv('photo-area', 'Vehicle photography area', {
    width: 200, height: 160, layer: 'structure', fill: '#eef0f3', stroke: P.inkSoft, strokeWidth: 1.5, keywords: ['photo booth', 'photo', 'listing pictures', 'studio'], label: 'Photography', labelPos: 'badge',
    draw: (c) => {
      const bl = badgeLayoutLocal(c);
      return `${boxRect(c, 6)}<path d="M${r2(c.w * 0.08)} ${r2(c.h * 0.85)} V${r2(c.h * 0.25)} Q${r2(c.w * 0.08)} ${r2(c.h * 0.08)} ${r2(c.w * 0.25)} ${r2(c.h * 0.08)} H${r2(c.w * 0.75)} Q${r2(c.w * 0.92)} ${r2(c.h * 0.08)} ${r2(c.w * 0.92)} ${r2(c.h * 0.25)} V${r2(c.h * 0.85)}" fill="none" stroke="${P.steel}" stroke-width="3"/>${badge('camera', bl.cx, bl.cy, bl.r, P.inkSoft)}`;
    },
  }),
  svZone('delivery-area', 'Vehicle delivery area', 'key', P.go, ['delivery', 'handover', 'sold']),
  svZone('unloading-area', 'Vehicle unloading area', 'truck', P.orange, ['unload', 'transport', 'car hauler']),
  svZone('loading-area', 'Vehicle loading area', 'truck', '#b88a00', ['load', 'transport']),
  svZone('storage-area', 'Vehicle storage area', 'storage', P.inkSoft, ['storage', 'stock', 'holding']),
  svZone('inventory-overflow', 'Inventory overflow area', 'car', P.violet, ['overflow', 'inventory', 'stock'], 260, 160),
  sv('ev-charger', 'Vehicle charging station', {
    width: 30, height: 30, layer: 'landmarks', fill: '#e8f5ec', stroke: P.ink, strokeWidth: 1.2, keywords: ['ev', 'electric', 'charger', 'charging', 'plug'], labelPos: 'below',
    draw: icon(30, 30, (c) => `${raisedShadow(7, 3, 16, 22, 3)}<rect x="7" y="3" width="16" height="22" rx="3" ${FS(c)}/><rect x="9.5" y="6" width="11" height="6" rx="1" fill="${P.ink}"/>${glyph('bolt', 15, 18, 9, P.go)}<path d="M23 16c5 0 5 8 0 10" fill="none" stroke="${P.ink}" stroke-width="1.5"/>`),
  }),
  sv('fueling-area', 'Fueling area', {
    width: 160, height: 90, layer: 'structure', fill: P.concrete, stroke: P.concreteEdge, strokeWidth: 1.5, keywords: ['gas', 'fuel', 'pump', 'petrol'], label: 'Fuel', labelPos: 'center',
    draw: (c) => `${boxRect(c)}<rect x="${r2(c.w * 0.1)}" y="${r2(c.h / 2 - 7)}" width="${r2(c.w * 0.8)}" height="14" rx="7" fill="#fff" stroke="${P.ink}" stroke-width="1.2"/>${[0.3, 0.7].map((f) => `<rect x="${r2(c.w * f - 7)}" y="${r2(c.h / 2 - 5)}" width="14" height="10" rx="1.5" fill="${P.danger}" stroke="${P.ink}" stroke-width="0.8"/>`).join('')}<rect x="${c.sw}" y="${c.sw}" width="${c.w - c.sw * 2}" height="${c.h - c.sw * 2}" fill="none" stroke="${P.inkSoft}" stroke-width="0.8" stroke-dasharray="5 4"/>`,
  }),
  svZone('tech-work-area', 'Technician work area', 'wrench', P.orange, ['technician', 'tech', 'workbench']),
  svZone('service-parking', 'Customer service parking', 'car', P.info, ['service customer', 'drop off']),
  svZone('parts-storage', 'Parts storage area', 'box', '#8a5a2b', ['parts', 'shelving', 'bins']),
];

function badgeLayoutLocal(c: DrawCtx) {
  const rr = Math.max(7, Math.min(20, Math.min(c.w, c.h) * 0.17));
  return { cx: c.w / 2, cy: c.h / 2 - rr * 0.75, r: rr };
}

