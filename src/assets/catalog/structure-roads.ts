import { category } from '../defs';
import { along, hatched, hLine, lane, laneArrow, pavementArrow, raisedShadow, room } from '../draw';
import { boxRect, F, FS, icon, P, r2, shade, text, type DrawCtx } from '../style';

const s = category('Structural objects');

const ROOM = { layer: 'structure' as const, fill: P.room, stroke: P.wall, strokeWidth: 3, labelPos: 'badge' as const };

export const STRUCTURE = [
  s('wall', 'Wall', { draw: (c) => boxRect(c), width: 240, height: 10, layer: 'structure', fill: P.wall, stroke: shade(P.wall, 0.3), strokeWidth: 1, keywords: ['partition', 'barrier'] }),
  s('partial-wall', 'Partial wall', {
    width: 160, height: 10, layer: 'structure', fill: '#9aa1ab', stroke: P.wall, strokeWidth: 1.2, keywords: ['half wall', 'knee wall', 'low wall'],
    draw: (c) => `${boxRect(c)}<path d="${Array.from({ length: Math.ceil(c.w / 8) }, (_, i) => `M${i * 8} ${c.h}l${c.h} ${-c.h}`).join('')}" stroke="${P.wall}" stroke-width="1" clip-path="inset(0)"/>`,
  }),
  s('column', 'Support column', {
    width: 24, height: 24, layer: 'structure', namePrefix: 'Column', fill: '#9a9fa6', stroke: P.ink, strokeWidth: 1.5, keywords: ['column', 'post', 'pier', 'structural'],
    draw: icon(24, 24, (c) => `${raisedShadow(2, 2, 20, 20, 1, 1.2)}<rect x="2" y="2" width="20" height="20" rx="1" ${FS(c)}/><path d="M2 2 22 22M22 2 2 22" stroke="${P.ink}" stroke-opacity="0.35" stroke-width="1"/>`),
  }),
  s('pillar', 'Pillar', {
    width: 24, height: 24, layer: 'structure', fill: '#b9b4aa', stroke: P.ink, strokeWidth: 1.5, keywords: ['round column', 'post'],
    draw: icon(24, 24, (c) => `<circle cx="13" cy="13.5" r="10" fill="${P.shadow}"/><circle cx="12" cy="12" r="10" ${FS(c)}/><circle cx="12" cy="12" r="6" fill="none" stroke="${P.ink}" stroke-opacity="0.25"/>`),
  }),
  s('support-beam', 'Support beam', {
    width: 240, height: 14, layer: 'structure', fill: '#c9ccd1', fillOpacity: 0.5, stroke: P.wall, strokeWidth: 1.2, keywords: ['overhead', 'girder', 'header'],
    draw: (c) => `<rect x="0" y="0" width="${c.w}" height="${c.h}" ${F(c)}/>${hLine(1.5, 0, c.w, c.stroke, c.sw, '8 4')}${hLine(c.h - 1.5, 0, c.w, c.stroke, c.sw, '8 4')}`,
  }),
  s('fence', 'Fence', {
    width: 200, height: 8, layer: 'structure', fill: P.steelDark, stroke: P.steelDark, strokeWidth: 1.5, fillable: false, keywords: ['chain link', 'barrier', 'perimeter'],
    draw: (c) => `${hLine(c.h / 2, 0, c.w, c.stroke, c.sw)}${along(c, 24, (x) => `<circle cx="${r2(x)}" cy="${c.h / 2}" r="${r2(Math.min(c.h / 2, 3))}" fill="${c.stroke}"/>`, 3)}<path d="${Array.from({ length: Math.ceil(c.w / 6) }, (_, i) => `M${i * 6} ${c.h / 2 - 2}l3 4l3 -4`).join('')}" fill="none" stroke="${c.stroke}" stroke-opacity="0.5" stroke-width="0.7"/>`,
  }),
  s('gate', 'Gate', {
    width: 100, height: 50, layer: 'structure', fill: P.steelDark, stroke: P.ink, strokeWidth: 1.5, keywords: ['swing gate', 'entry', 'fence'],
    draw: icon(100, 50, (c) => `<rect x="0" y="43" width="7" height="7" ${FS(c)}/><rect x="93" y="43" width="7" height="7" ${FS(c)}/><path d="M7 46.5 44 18M93 46.5 56 18" stroke="${c.fill}" stroke-width="3.5" stroke-linecap="round"/><path d="M7 46.5 A43 43 0 0 1 48 9M93 46.5 A43 43 0 0 0 52 9" fill="none" stroke="${P.inkSoft}" stroke-width="0.9" stroke-dasharray="3 2"/><path d="M7 46.5H93" stroke="${P.inkSoft}" stroke-width="0.8" stroke-dasharray="2 3"/>`),
  }),
  s('barrier-arm', 'Security barrier', {
    width: 110, height: 20, layer: 'structure', fill: '#ffffff', stroke: P.ink, strokeWidth: 1, keywords: ['boom', 'arm', 'gate arm', 'ticket', 'barrier'],
    draw: icon(110, 20, (c) => `${raisedShadow(1, 2, 18, 16, 2)}<rect x="1" y="2" width="18" height="16" rx="2" fill="#f2b705" stroke="${P.ink}" stroke-width="1"/><circle cx="10" cy="10" r="3" fill="${P.ink}"/><rect x="19" y="7" width="89" height="6" rx="3" ${FS(c)}/>${[0, 1, 2, 3, 4].map((i) => `<rect x="${27 + i * 17}" y="7" width="8" height="6" fill="${P.danger}"/>`).join('')}`),
  }),
  s('bollard', 'Bollard', {
    width: 12, height: 12, layer: 'structure', fill: P.safety, stroke: P.ink, strokeWidth: 1.2, keywords: ['post', 'protection', 'pole'],
    draw: icon(12, 12, (c) => `<circle cx="6.8" cy="7" r="5" fill="${P.shadow}"/><circle cx="6" cy="6" r="5" ${FS(c)}/><circle cx="6" cy="6" r="2" fill="#fff" fill-opacity="0.6"/>`),
  }),
  s('guardrail', 'Guardrail', {
    width: 200, height: 10, layer: 'structure', fill: '#c3c9d0', stroke: P.steelDark, strokeWidth: 1, keywords: ['crash barrier', 'rail', 'w-beam'],
    draw: (c) => `${along(c, 30, (x) => `<rect x="${r2(x - 2.5)}" y="${r2(c.h / 2 - 1)}" width="5" height="${r2(c.h / 2 + 1)}" fill="${P.steelDark}"/>`, 4)}<rect x="${c.sw / 2}" y="${r2(c.h * 0.15)}" width="${c.w - c.sw}" height="${r2(c.h * 0.42)}" rx="2" ${FS(c)}/>${hLine(c.h * 0.36, 2, c.w - 2, P.steelDark, 0.6)}`,
  }),
  s('concrete-divider', 'Concrete divider', {
    width: 200, height: 14, layer: 'structure', fill: P.concrete, stroke: P.concreteEdge, strokeWidth: 1.2, keywords: ['jersey barrier', 'median', 'k-rail'],
    draw: (c) => `${boxRect(c, 3)}${hLine(c.h / 2, 3, c.w - 3, P.concreteEdge, 1)}${along(c, 50, (x) => `<path d="M${r2(x)} 0 V${c.h}" stroke="${P.concreteEdge}" stroke-width="1"/>`, 25)}`,
  }),
  s('parking-stop', 'Parking stop', {
    width: 30, height: 7, layer: 'structure', fill: '#e8e3d8', stroke: P.concreteEdge, strokeWidth: 1, keywords: ['wheel stop', 'curb stop', 'parking block', 'car stop'],
    draw: (c) => `${boxRect(c, 2)}<rect x="${r2(c.w * 0.18)}" y="${r2(c.h * 0.25)}" width="${r2(c.w * 0.14)}" height="${r2(c.h * 0.5)}" fill="${P.safety}"/><rect x="${r2(c.w * 0.68)}" y="${r2(c.h * 0.25)}" width="${r2(c.w * 0.14)}" height="${r2(c.h * 0.5)}" fill="${P.safety}"/>`,
  }),
  s('protective-barrier', 'Protective barrier', {
    width: 120, height: 12, layer: 'structure', fill: P.safety, stroke: P.ink, strokeWidth: 1, keywords: ['safety barrier', 'hazard', 'striped', 'crash'],
    draw: (c) => {
      const id = `pb${Math.round(c.w)}`;
      return `<defs><pattern id="${id}" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="7" height="14" fill="${P.ink}"/></pattern></defs>${boxRect(c, 2)}<rect x="${c.sw / 2}" y="${c.sw / 2}" width="${c.w - c.sw}" height="${c.h - c.sw}" rx="2" fill="url(#${id})" fill-opacity="0.85"/>`;
    },
  }),
  s('building-outline', 'Building outline', {
    width: 280, height: 180, layer: 'structure', fill: P.building, fillOpacity: 0, stroke: P.wall, strokeWidth: 4, keywords: ['footprint', 'perimeter', 'outline'],
    label: 'Building', labelPos: 'center', draw: (c) => boxRect(c),
  }),
  s('utility-room', 'Utility room', { ...ROOM, draw: room('bolt'), width: 140, height: 100, label: 'Utility', keywords: ['electrical', 'meter'] }),
  s('storage-room', 'Storage room', { ...ROOM, draw: room('storage'), width: 140, height: 100, label: 'Storage', keywords: ['closet', 'supply'] }),
  s('mechanical-room', 'Mechanical room', { ...ROOM, draw: room('gear'), width: 140, height: 100, label: 'Mechanical', keywords: ['boiler', 'pump', 'equipment'] }),
  s('hvac-unit', 'HVAC unit', {
    width: 50, height: 50, layer: 'structure', fill: '#c8ced6', stroke: P.ink, strokeWidth: 1.2, keywords: ['air conditioner', 'ac', 'condenser', 'rooftop unit'], labelPos: 'below',
    draw: icon(50, 50, (c) => `${raisedShadow(3, 3, 44, 44, 3, 2)}<rect x="3" y="3" width="44" height="44" rx="3" ${FS(c)}/><circle cx="25" cy="25" r="16" fill="${P.steelDark}" fill-opacity="0.25" stroke="${P.ink}" stroke-width="1"/>${[0, 1, 2, 3, 4, 5].map((i) => `<circle cx="25" cy="25" r="${3 + i * 2.4}" fill="none" stroke="${P.ink}" stroke-opacity="0.35" stroke-width="0.7"/>`).join('')}<circle cx="25" cy="25" r="3" fill="${P.ink}"/>`),
  }),
  s('garage-door', 'Garage door', {
    width: 100, height: 24, layer: 'structure', fill: '#d9dde2', stroke: P.ink, strokeWidth: 1, keywords: ['overhead door', 'bay door', 'sectional'],
    draw: (c) => `<rect x="2" y="${r2(c.h * 0.42)}" width="${c.w - 4}" height="${r2(c.h * 0.55)}" fill="none" stroke="${P.inkSoft}" stroke-width="0.9" stroke-dasharray="4 3"/><rect x="${c.sw / 2}" y="${c.sw / 2}" width="${c.w - c.sw}" height="${r2(c.h * 0.32)}" ${FS(c)}/>${along({ ...c, w: c.w }, 20, (x) => `<path d="M${r2(x)} ${c.sw} V${r2(c.h * 0.32)}" stroke="${P.inkSoft}" stroke-width="0.8"/>`, 10)}`,
  }),
  s('rollup-door', 'Roll-up service door', {
    width: 100, height: 24, layer: 'structure', fill: '#b9c0c8', stroke: P.ink, strokeWidth: 1, keywords: ['roll up', 'rolling door', 'shutter', 'service door'],
    draw: (c) => `<rect x="${c.sw / 2}" y="${c.sw / 2}" width="${c.w - c.sw}" height="${r2(c.h * 0.32)}" ${FS(c)}/><path d="${Array.from({ length: Math.floor(c.w / 4) }, (_, i) => `M${i * 4 + 2} ${c.sw}V${r2(c.h * 0.32)}`).join('')}" stroke="${P.ink}" stroke-opacity="0.3" stroke-width="0.6"/><rect x="${r2(c.w * 0.04)}" y="${r2(c.h * 0.55)}" width="${r2(c.w * 0.92)}" height="${r2(c.h * 0.3)}" rx="${r2(c.h * 0.15)}" fill="${P.steel}" stroke="${P.inkSoft}" stroke-width="0.8"/>`,
  }),
  s('loading-dock', 'Loading dock', {
    width: 140, height: 90, layer: 'structure', fill: P.concrete, stroke: P.concreteEdge, strokeWidth: 1.5, keywords: ['dock', 'bay', 'truck', 'receiving'], label: 'Dock', labelPos: 'center',
    draw: (c) => `${boxRect(c)}<rect x="0" y="${r2(c.h - 8)}" width="${c.w}" height="8" fill="${P.safety}"/><path d="${Array.from({ length: Math.ceil(c.w / 10) }, (_, i) => `M${i * 10} ${c.h}l8 -8`).join('')}" stroke="${P.ink}" stroke-width="3"/><rect x="${r2(c.w * 0.2)}" y="${r2(c.h - 12)}" width="8" height="4" fill="${P.ink}"/><rect x="${r2(c.w * 0.8 - 8)}" y="${r2(c.h - 12)}" width="8" height="4" fill="${P.ink}"/>`,
  }),
  s('canopy', 'Canopy', {
    width: 200, height: 100, layer: 'structure', fill: '#e8e0cf', fillOpacity: 0.6, stroke: '#8a7f6b', strokeWidth: 1.5, keywords: ['awning', 'cover', 'porte cochere', 'roof'],
    label: 'Canopy', labelPos: 'center',
    draw: (c) => `${boxRect(c, 0, `stroke-dasharray="${c.sw * 5} ${c.sw * 3}"`)}${hLine(c.h / 2, 0, c.w, c.stroke, 1)}${[[6, 6], [c.w - 6, 6], [6, c.h - 6], [c.w - 6, c.h - 6]].map(([x, y]) => `<rect x="${x - 3}" y="${y - 3}" width="6" height="6" fill="${P.wall}"/>`).join('')}`,
  }),
  s('covered-parking', 'Covered parking structure', {
    width: 270, height: 110, layer: 'structure', fill: '#cfd8e3', fillOpacity: 0.45, stroke: '#5f7189', strokeWidth: 2, keywords: ['carport', 'solar canopy', 'shade structure', 'covered'],
    label: 'Covered parking', labelPos: 'center',
    draw: (c) => `${boxRect(c)}${along(c, 45, (x) => `<path d="M${r2(x)} 0 V${c.h}" stroke="${c.stroke}" stroke-opacity="0.35" stroke-width="1"/>`, 22.5)}${hLine(c.h / 2, 0, c.w, c.stroke, 1)}${along(c, 90, (x) => `<rect x="${r2(x - 3)}" y="${r2(c.h / 2 - 3)}" width="6" height="6" fill="${P.wall}"/>`, 22.5)}`,
  }),
];

// ---------------------------------------------------------------- roads

const rd = category('Roads and traffic');
const ROAD = { layer: 'structure' as const, fill: P.asphalt, stroke: P.asphaltEdge, strokeWidth: 0, labelColor: '#ffffff' };

const doubleYellow = (c: DrawCtx, y = c.h / 2) => hLine(y - 2, 0, c.w, P.paintYellow, 1.6) + hLine(y + 2, 0, c.w, P.paintYellow, 1.6);
const word = (c: DrawCtx, t: string, size = Math.min(c.h * 0.35, 16)) => text(c.w / 2, c.h / 2, size, t, P.paint);

/** Quarter-circle road: the curve turns from the left edge down to the bottom. */
const curve = (width: number, marks: 'road' | 'lane') => (c: DrawCtx) => {
  const R = Math.min(c.w, c.h);
  const rIn = Math.max(0, R - width);
  const ox = 0, oy = c.h;
  const arc = (r: number) => `M${ox} ${r2(oy - r)} A${r2(r)} ${r2(r)} 0 0 1 ${r2(ox + r)} ${oy}`;
  const shape = `M${ox} ${r2(oy - R)} A${r2(R)} ${r2(R)} 0 0 1 ${r2(ox + R)} ${oy} L${r2(ox + rIn)} ${oy} A${r2(rIn)} ${r2(rIn)} 0 0 0 ${ox} ${r2(oy - rIn)} Z`;
  const mid = (R + rIn) / 2;
  const lines = marks === 'road'
    ? `<path d="${arc(mid - 2)}" fill="none" stroke="${P.paintYellow}" stroke-width="1.6"/><path d="${arc(mid + 2)}" fill="none" stroke="${P.paintYellow}" stroke-width="1.6"/>`
    : '';
  return `<path d="${shape}" ${FS(c)}/><path d="${arc(R - 3.5)}" fill="none" stroke="${P.paint}" stroke-width="2"/><path d="${arc(rIn + 3.5)}" fill="none" stroke="${P.paint}" stroke-width="2"/>${lines}`;
};

const ramp = (dir: 'up' | 'down' | 'none') => (c: DrawCtx) => {
  const chev = along(c, 30, (x) => `<path d="M${r2(x - 6)} ${r2(c.h * 0.25)} L${r2(x + 6)} ${r2(c.h / 2)} L${r2(x - 6)} ${r2(c.h * 0.75)}" fill="none" stroke="${P.paint}" stroke-opacity="0.75" stroke-width="3" stroke-linejoin="round"/>`, 20);
  const walls = `<rect x="0" y="0" width="${c.w}" height="4" fill="${P.wall}"/><rect x="0" y="${c.h - 4}" width="${c.w}" height="4" fill="${P.wall}"/>`;
  const label = dir === 'none' ? '' : `<rect x="${r2(c.w / 2 - 26)}" y="${r2(c.h / 2 - 11)}" width="52" height="22" rx="3" fill="${c.fill}"/>${text(c.w / 2, c.h / 2, 12, dir === 'up' ? 'UP' : 'DOWN', P.paint)}`;
  return `${boxRect(c)}${walls}${chev}${label}`;
};

export const ROADS = [
  rd('straight-road', 'Straight road', { ...ROAD, width: 300, height: 120, keywords: ['street', 'two lane'], draw: lane((c) => doubleYellow(c)) }),
  rd('curved-road', 'Curved road', { ...ROAD, width: 240, height: 240, keywords: ['bend', 'turn', 'corner', 'street'], draw: curve(120, 'road') }),
  rd('road', 'Straight driving lane', { ...ROAD, width: 300, height: 60, keywords: ['drive', 'aisle', 'lane'], draw: lane(() => '') }),
  rd('curved-lane', 'Curved driving lane', { ...ROAD, width: 160, height: 160, keywords: ['bend', 'aisle', 'turn'], draw: curve(60, 'lane') }),
  rd('one-way-lane', 'One-way lane', { ...ROAD, width: 300, height: 60, keywords: ['one way', 'aisle'], draw: lane((c) => along(c, 110, (x) => laneArrow(x, c.h / 2, 34))) }),
  rd('two-way-lane', 'Two-way lane', {
    ...ROAD, width: 300, height: 120, keywords: ['two way', 'aisle', 'street'],
    draw: lane((c) => hLine(c.h / 2, 0, c.w, P.paint, 2, '14 10') + along(c, 140, (x) => laneArrow(x, c.h * 0.27, 34) + laneArrow(x + 40, c.h * 0.73, 34, P.paint, true))),
  }),
  rd('entrance-lane', 'Entrance lane', { ...ROAD, width: 240, height: 60, keywords: ['entry', 'in', 'inbound'], draw: lane((c) => laneArrow(c.w * 0.72, c.h / 2, 40) + word(c, 'IN')) }),
  rd('exit-lane', 'Exit lane', { ...ROAD, width: 240, height: 60, keywords: ['out', 'outbound', 'egress'], draw: lane((c) => laneArrow(c.w * 0.72, c.h / 2, 40) + word(c, 'OUT')) }),
  rd('driveway', 'Driveway', {
    layer: 'structure', fill: P.concrete, stroke: P.concreteEdge, strokeWidth: 1.5, width: 120, height: 80, keywords: ['apron', 'curb cut', 'access'],
    draw: (c) => `<path d="M0 ${c.h} C${r2(c.w * 0.18)} ${c.h} ${r2(c.w * 0.18)} ${r2(c.h * 0.75)} ${r2(c.w * 0.18)} ${r2(c.h * 0.6)} V0 H${r2(c.w * 0.82)} V${r2(c.h * 0.6)} C${r2(c.w * 0.82)} ${r2(c.h * 0.75)} ${r2(c.w * 0.82)} ${c.h} ${c.w} ${c.h} Z" ${FS(c)}/>${along({ ...c, w: c.w * 0.64 }, 20, (x) => `<path d="M${r2(c.w * 0.18 + x)} 0 v${r2(c.h * 0.6)}" stroke="${P.concreteEdge}" stroke-width="0.7"/>`, 10)}`,
  }),
  rd('ramp', 'Garage ramp', { layer: 'structure', fill: '#9aa0a8', stroke: P.wall, strokeWidth: 1.5, width: 240, height: 70, connector: true, labelColor: '#ffffff', keywords: ['ramp', 'incline', 'slope', 'level'], draw: ramp('none') }),
  rd('ramp-up', 'Upward ramp', { layer: 'structure', fill: '#9aa0a8', stroke: P.wall, strokeWidth: 1.5, width: 240, height: 70, connector: true, keywords: ['ramp', 'up', 'incline'], draw: ramp('up') }),
  rd('ramp-down', 'Downward ramp', { layer: 'structure', fill: '#9aa0a8', stroke: P.wall, strokeWidth: 1.5, width: 240, height: 70, connector: true, keywords: ['ramp', 'down', 'decline'], draw: ramp('down') }),
  rd('turning-lane', 'Turning lane', {
    ...ROAD, width: 240, height: 60, keywords: ['turn lane', 'left turn', 'right turn'],
    draw: lane((c) => `<g transform="translate(${r2(c.w * 0.6)} ${r2(c.h / 2)}) rotate(90) scale(${r2(c.h / 52)}) translate(-12 -30)"><path d="M15.5 58V24C15.5 19 13 17 9 17H8V23L0 13 8 3V9H10C18 9 22.5 14 22.5 23V58Z" fill="${P.paint}"/></g>`),
  }),
  rd('turnaround', 'Vehicle turnaround', {
    ...ROAD, width: 240, height: 240, keywords: ['cul de sac', 'turn around', 'bulb'], strokeWidth: 0,
    draw: (c) => {
      const r = Math.min(c.w, c.h) / 2;
      const cx = c.w / 2, cy = c.h / 2, island = r * 0.32;
      // The lane line is a full circle on the same centre as the ring, halfway
      // between the island's edge and the inside of the outer border, so it
      // stays centred between the two lanes at any size, border or rotation.
      const lane = (island + 1 + (r - c.sw)) / 2;
      return `<rect x="0" y="${r2(cy - 30)}" width="${r2(cx)}" height="60" ${F(c)}/><circle cx="${r2(cx)}" cy="${r2(cy)}" r="${r2(r - c.sw / 2)}" ${FS(c)}/><circle cx="${r2(cx)}" cy="${r2(cy)}" r="${r2(island)}" fill="${P.grass}" stroke="${P.concreteEdge}" stroke-width="2"/><circle cx="${r2(cx)}" cy="${r2(cy)}" r="${r2(lane)}" fill="none" stroke="${P.paint}" stroke-width="2" stroke-dasharray="8 6"/>`;
    },
  }),
  rd('roundabout', 'Roundabout', {
    ...ROAD, width: 260, height: 260, keywords: ['traffic circle', 'rotary', 'circle'],
    draw: (c) => {
      const cx = c.w / 2, cy = c.h / 2, R = Math.min(c.w, c.h) / 2;
      const arms = [0, 90, 180, 270].map((a) => `<rect x="${r2(cx - 30)}" y="0" width="60" height="${r2(cy)}" ${F(c)} transform="rotate(${a} ${r2(cx)} ${r2(cy)})"/>`).join('');
      const arrows = [45, 135, 225, 315].map((a) => `<g transform="rotate(${a} ${r2(cx)} ${r2(cy)}) translate(${r2(cx)} ${r2(cy - R * 0.62)}) scale(-0.6 0.6)"><path d="M-20 -3H8V-9L20 0 8 9V3H-20Z" fill="${P.paint}"/></g>`).join('');
      return `${arms}<circle cx="${r2(cx)}" cy="${r2(cy)}" r="${r2(R * 0.8)}" ${FS(c)}/><circle cx="${r2(cx)}" cy="${r2(cy)}" r="${r2(R * 0.36)}" fill="${P.grass}" stroke="${P.concreteEdge}" stroke-width="3"/>${arrows}`;
    },
  }),
  rd('intersection', 'Intersection', {
    ...ROAD, width: 300, height: 300, keywords: ['crossroads', 'junction', 'cross'],
    draw: (c) => {
      const cx = c.w / 2, cy = c.h / 2, half = 60;
      const arm = (a: number) => `<g transform="rotate(${a} ${r2(cx)} ${r2(cy)})"><rect x="${r2(cx - half)}" y="0" width="${half * 2}" height="${r2(cy)}" ${F(c)}/><path d="M${r2(cx - 2)} 0 V${r2(cy - half - 8)} M${r2(cx + 2)} 0 V${r2(cy - half - 8)}" stroke="${P.paintYellow}" stroke-width="1.6"/><path d="M${r2(cx - half + 2)} ${r2(cy - half - 6)} H${r2(cx)}" stroke="${P.paint}" stroke-width="4"/><path d="M${r2(cx - half + 3.5)} 0 V${r2(cy - half)} M${r2(cx + half - 3.5)} 0 V${r2(cy - half)}" stroke="${P.paint}" stroke-width="2"/></g>`;
      return [0, 90, 180, 270].map(arm).join('') + `<rect x="${r2(cx - half)}" y="${r2(cy - half)}" width="${half * 2}" height="${half * 2}" ${F(c)}/>`;
    },
  }),
  rd('lane-divider', 'Lane divider', { layer: 'structure', fill: P.asphalt, stroke: P.paint, strokeWidth: 2, width: 240, height: 12, keywords: ['dashed line', 'lane line', 'skip line'], draw: (c) => `<rect width="${c.w}" height="${c.h}" ${F(c)}/>${hLine(c.h / 2, 0, c.w, c.stroke, c.sw, '14 10')}` }),
  rd('road-centerline', 'Road centerline', { layer: 'structure', fill: P.asphalt, stroke: P.paintYellow, strokeWidth: 1.6, width: 240, height: 12, keywords: ['double yellow', 'center line'], draw: (c) => `<rect width="${c.w}" height="${c.h}" ${F(c)}/>${hLine(c.h / 2 - c.sw * 1.2, 0, c.w, c.stroke, c.sw)}${hLine(c.h / 2 + c.sw * 1.2, 0, c.w, c.stroke, c.sw)}` }),
  rd('road-boundary', 'Road boundary', { layer: 'structure', fill: P.asphalt, stroke: P.paint, strokeWidth: 2.5, width: 240, height: 12, keywords: ['edge line', 'fog line', 'solid line'], draw: (c) => `<rect width="${c.w}" height="${c.h}" ${F(c)}/>${hLine(c.h / 2, 0, c.w, c.stroke, c.sw)}` }),
  rd('speed-bump', 'Speed bump', {
    layer: 'structure', fill: P.safety, stroke: P.ink, strokeWidth: 1, width: 120, height: 16, keywords: ['speed hump', 'traffic calming'],
    draw: (c) => `${boxRect(c, c.h / 2)}${along(c, 16, (x) => `<path d="M${r2(x - 3)} ${r2(c.h * 0.2)} L${r2(x + 3)} ${r2(c.h / 2)} L${r2(x - 3)} ${r2(c.h * 0.8)}" fill="none" stroke="${P.ink}" stroke-width="2.4"/>`, 10)}`,
  }),
  rd('stop-line', 'Stop line', { layer: 'structure', fill: P.asphalt, stroke: P.paint, strokeWidth: 6, width: 60, height: 14, keywords: ['stop bar', 'limit line'], draw: (c) => `<rect width="${c.w}" height="${c.h}" ${F(c)}/>${hLine(c.h / 2, 2, c.w - 2, c.stroke, Math.min(c.sw, c.h))}` }),
  rd('yield-line', 'Yield line', {
    layer: 'structure', fill: P.asphalt, stroke: P.paint, strokeWidth: 0, width: 120, height: 14, keywords: ['sharks teeth', 'give way'],
    draw: (c) => `<rect width="${c.w}" height="${c.h}" ${F(c)}/>${along(c, 14, (x) => `<path d="M${r2(x - 5)} 2 H${r2(x + 5)} L${r2(x)} ${r2(c.h - 2)} Z" fill="${P.paint}"/>`, 7)}`,
  }),
  rd('road-closure', 'Road closure', {
    layer: 'structure', fill: P.orange, stroke: P.ink, strokeWidth: 1, width: 120, height: 30, keywords: ['closed', 'barricade', 'blocked'],
    draw: (c) => `<rect x="0" y="0" width="${c.w}" height="${c.h}" fill="${P.danger}" fill-opacity="0.12"/>${raisedShadow(4, c.h * 0.3, c.w - 8, c.h * 0.4, 2)}<rect x="4" y="${r2(c.h * 0.3)}" width="${c.w - 8}" height="${r2(c.h * 0.4)}" rx="2" ${FS(c)}/>${along({ ...c, w: c.w - 8 }, 14, (x) => `<path d="M${r2(x + 4 - 3)} ${r2(c.h * 0.7)} l7 ${r2(-c.h * 0.4)}" stroke="#fff" stroke-width="4"/>`, 6)}`,
  }),
  rd('traffic-diversion', 'Traffic diversion', {
    layer: 'structure', fill: P.orange, stroke: P.ink, strokeWidth: 0.8, width: 160, height: 80, keywords: ['detour', 'cones', 'taper', 'reroute'],
    draw: (c) => {
      const cones = [0, 1, 2, 3, 4].map((i) => {
        const x = c.w * 0.1 + i * c.w * 0.14, y = c.h * 0.85 - i * c.h * 0.14;
        return `<circle cx="${r2(x)}" cy="${r2(y)}" r="5" ${FS(c)}/><circle cx="${r2(x)}" cy="${r2(y)}" r="2" fill="#fff"/>`;
      }).join('');
      return `${cones}<path d="M${r2(c.w * 0.35)} ${r2(c.h * 0.85)} C${r2(c.w * 0.6)} ${r2(c.h * 0.85)} ${r2(c.w * 0.62)} ${r2(c.h * 0.25)} ${r2(c.w * 0.88)} ${r2(c.h * 0.25)}" fill="none" stroke="${P.orange}" stroke-width="4"/><path d="M${r2(c.w * 0.86)} ${r2(c.h * 0.12)} L${r2(c.w * 0.98)} ${r2(c.h * 0.25)} L${r2(c.w * 0.86)} ${r2(c.h * 0.38)} Z" fill="${P.orange}"/>`;
    },
  }),
  rd('service-drive', 'Service drive', { ...ROAD, width: 300, height: 60, keywords: ['service lane', 'dealership'], draw: lane((c) => word(c, 'SERVICE') + laneArrow(c.w * 0.85, c.h / 2, 30)) }),
  rd('service-reception-lane', 'Service reception lane', {
    ...ROAD, fill: '#5f6f82', width: 300, height: 70, keywords: ['service write up', 'service drive', 'reception', 'dealership'],
    draw: lane((c) => hLine(c.h / 2, 0, c.w, P.paint, 1, '4 6') + text(c.w / 2, c.h / 2, Math.min(c.h * 0.24, 12), 'SERVICE RECEPTION', P.paint) + laneArrow(c.w * 0.9, c.h / 2, 26)),
  }),
  rd('drive-through-lane', 'Drive-through lane', { ...ROAD, width: 300, height: 60, keywords: ['drive thru', 'pickup window'], draw: lane((c) => word(c, 'DRIVE THRU', Math.min(c.h * 0.3, 14)) + laneArrow(c.w * 0.12, c.h / 2, 26) + laneArrow(c.w * 0.88, c.h / 2, 26)) }),
  rd('loading-lane', 'Loading lane', {
    ...ROAD, width: 300, height: 60, keywords: ['loading', 'delivery', 'freight'],
    draw: (c) => hatched(P.paintYellow, 'LOADING', P.ink)(c),
  }),
];

// ---------------------------------------------------------------- pavement arrows

const ar = category('Directional arrows');
const ARROW = { layer: 'labels' as const, fill: P.paint, stroke: P.inkSoft, strokeWidth: 1, width: 62, height: 26, keywords: ['arrow', 'direction', 'paint'] };

export const ARROWS = [
  ar('arrow', 'Straight arrow', { ...ARROW, draw: pavementArrow('straight'), keywords: ['ahead', 'forward', 'straight'] }),
  ar('arrow-left', 'Left-turn arrow', { ...ARROW, draw: pavementArrow('left'), keywords: ['turn', 'left'] }),
  ar('arrow-right', 'Right-turn arrow', { ...ARROW, draw: pavementArrow('right'), keywords: ['turn', 'right'] }),
  ar('arrow-uturn', 'U-turn arrow', { ...ARROW, draw: pavementArrow('uturn'), keywords: ['u turn', 'turnaround'] }),
  ar('arrow-one-way', 'One-way arrow', { ...ARROW, height: 40, draw: pavementArrow('straight', { word: 'ONE WAY' }), keywords: ['one way'] }),
  ar('arrow-two-way', 'Two-way arrow', { ...ARROW, draw: pavementArrow('two'), keywords: ['two way', 'both ways'] }),
  ar('arrow-entrance', 'Entrance arrow', { ...ARROW, fill: P.go, stroke: shade(P.go, 0.4), height: 40, draw: pavementArrow('straight', { word: 'ENTER' }), keywords: ['entrance', 'in', 'enter'] }),
  ar('arrow-exit', 'Exit arrow', { ...ARROW, fill: P.danger, stroke: shade(P.danger, 0.4), height: 40, draw: pavementArrow('straight', { word: 'EXIT' }), keywords: ['exit', 'out'] }),
  ar('arrow-merge', 'Merge arrow', { ...ARROW, draw: pavementArrow('merge'), keywords: ['merge', 'lane ends'] }),
  ar('arrow-ramp-up', 'Upward ramp arrow', { ...ARROW, height: 40, draw: pavementArrow('straight', { word: 'UP' }), keywords: ['ramp', 'up'] }),
  ar('arrow-ramp-down', 'Downward ramp arrow', { ...ARROW, height: 40, draw: pavementArrow('straight', { word: 'DOWN' }), keywords: ['ramp', 'down'] }),
  ar('arrow-custom', 'Custom directional arrow', {
    ...ARROW, fill: P.info, stroke: shade(P.info, 0.4), width: 80, height: 34, keywords: ['custom', 'pointer'],
    draw: (c) => {
      const t = Math.max(4, c.h * 0.3), hw = Math.min(c.w * 0.4, c.h * 0.9);
      return `<path d="M${c.sw} ${r2(c.h / 2 - t / 2)} H${r2(c.w - hw)} V${r2(c.sw)} L${r2(c.w - c.sw)} ${r2(c.h / 2)} L${r2(c.w - hw)} ${r2(c.h - c.sw)} V${r2(c.h / 2 + t / 2)} H${c.sw} Z" ${FS(c)}/>`;
    },
  }),
];

