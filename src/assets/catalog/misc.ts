import { category, type AssetCategory, type AssetDef, type TextPreset } from '../defs';
import { building, disc, hLine, lane, pin, zone } from '../draw';
import { boxRect, F, FS, icon, P, r2, S, text, type DrawCtx } from '../style';

// ---------------------------------------------------------------- zones

const zn = category('Zones and boundaries');
const Z = (key: string, name: string, color: string, o: { glyph?: string; hatch?: string; label?: string; keywords?: string[]; w?: number; h?: number } = {}) =>
  zn(key, name, {
    draw: zone({ glyph: o.glyph, hatch: o.hatch }), width: o.w ?? 220, height: o.h ?? 130, layer: 'structure', fill: color, fillOpacity: 0.15, stroke: color, strokeWidth: 2,
    label: o.label ?? name.replace(/ zone$/i, ''), labelPos: o.glyph ? 'badge' : 'center', keywords: ['zone', 'area', ...(o.keywords ?? [])],
  });

const outline = (dash: boolean): ((c: DrawCtx) => string) => (c) => boxRect(c, 0, dash ? `stroke-dasharray="${r2(c.sw * 4)} ${r2(c.sw * 2.5)}"` : '');

export const ZONES = [
  Z('parking-row-zone', 'Parking row', P.inkSoft, { label: 'Row A', w: 460, h: 100, keywords: ['row', 'aisle'] }),
  Z('parking-section', 'Parking section', P.info, { label: 'Section 1', w: 360, h: 220, keywords: ['section', 'block'] }),
  Z('parking-zone', 'Parking zone', P.info, { glyph: 'car', label: 'Zone A', keywords: ['parking area'] }),
  zn('level-boundary', 'Garage level boundary', { draw: outline(true), width: 600, height: 400, layer: 'structure', fill: '#ffffff', fillOpacity: 0, stroke: P.violet, strokeWidth: 4, keywords: ['level', 'floor', 'deck', 'boundary'], label: 'Level 1', labelPos: 'center' }),
  zn('lot-boundary', 'Lot boundary', { draw: outline(false), width: 600, height: 400, layer: 'structure', fill: '#ffffff', fillOpacity: 0, stroke: P.ink, strokeWidth: 4, keywords: ['property line', 'perimeter', 'site'], label: 'Lot', labelPos: 'center' }),
  Z('valet-zone', 'Valet operating zone', P.teal, { glyph: 'key', label: 'Valet', keywords: ['valet'] }),
  Z('employee-zone', 'Employee-only zone', '#4b5563', { glyph: 'person', label: 'Employees only', keywords: ['staff', 'employee'] }),
  Z('vip-zone', 'VIP zone', '#b08d1e', { glyph: 'star', label: 'VIP', keywords: ['vip', 'premium'] }),
  Z('reserved-zone', 'Reserved zone', P.go, { glyph: 'lock', label: 'Reserved', keywords: ['reserved'] }),
  Z('restricted-zone', 'Restricted zone', P.danger, { glyph: 'lock', hatch: 'rgba(210,58,50,0.18)', label: 'Restricted', keywords: ['authorized', 'no access'] }),
  Z('no-parking-zone', 'No-parking zone', P.danger, { glyph: 'noEntry', hatch: 'rgba(210,58,50,0.18)', label: 'No parking', keywords: ['tow', 'no parking'] }),
  Z('closure-zone', 'Temporary closure zone', P.orange, { glyph: 'closed', hatch: 'rgba(234,122,26,0.2)', label: 'Closed', keywords: ['closed', 'temporary', 'blocked'] }),
  Z('event-zone', 'Event-specific zone', '#b03a72', { glyph: 'ticket', label: 'Event', keywords: ['event', 'game day', 'concert'] }),
  Z('overflow-zone', 'Overflow zone', P.violet, { glyph: 'car', label: 'Overflow', keywords: ['overflow', 'extra'] }),
  Z('emergency-zone', 'Emergency-access zone', P.danger, { glyph: 'cross', label: 'Emergency access', keywords: ['fire', 'ambulance', 'emergency'] }),
  Z('inventory-section', 'Inventory section boundary', P.info, { label: 'Inventory A', w: 360, h: 220, keywords: ['inventory', 'stock', 'lot section'] }),
  Z('service-zone', 'Service department zone', P.orange, { glyph: 'wrench', label: 'Service', keywords: ['service'] }),
  Z('customer-service-zone', 'Customer service zone', P.teal, { glyph: 'bell', label: 'Customer service', keywords: ['customer', 'service'] }),
  Z('delivery-zone', 'Vehicle delivery zone', P.go, { glyph: 'key', label: 'Delivery', keywords: ['delivery', 'sold'] }),
  zn('custom-rect', 'Custom rectangle', { draw: (c) => boxRect(c), width: 160, height: 100, layer: 'structure', fill: P.info, fillOpacity: 0.2, stroke: P.info, strokeWidth: 2, keywords: ['shape', 'box', 'square'] }),
  zn('custom-circle', 'Custom circle', { draw: ellipse, width: 120, height: 120, layer: 'structure', fill: P.info, fillOpacity: 0.2, stroke: P.info, strokeWidth: 2, keywords: ['shape', 'round'] }),
  zn('custom-polygon', 'Custom polygon', { creates: 'soon', width: 0, height: 0, layer: 'structure', fill: P.info, stroke: P.info, strokeWidth: 2, keywords: ['shape', 'polygon', 'freeform'], note: 'Point-by-point drawing is the next stage. Use a rectangle or circle zone and rotate it for now.' }),
  zn('custom-boundary-line', 'Custom boundary line', { draw: dashLine('10 6'), width: 240, height: 10, layer: 'structure', fill: P.ink, fillable: false, stroke: P.danger, strokeWidth: 3, keywords: ['line', 'boundary', 'border', 'edge'] }),
  zn('custom-zone', 'Custom zone', { also: ['Custom and reusable'], draw: zone({ glyph: 'pin' }), width: 220, height: 130, layer: 'structure', fill: P.teal, fillOpacity: 0.15, stroke: P.teal, strokeWidth: 2, label: 'Custom zone', labelPos: 'badge', keywords: ['zone', 'custom', 'area'] }),
];

function ellipse(c: DrawCtx) {
  return `<ellipse cx="${r2(c.w / 2)}" cy="${r2(c.h / 2)}" rx="${r2(Math.max(0, c.w / 2 - c.sw / 2))}" ry="${r2(Math.max(0, c.h / 2 - c.sw / 2))}" ${FS(c)}/>`;
}
function dashLine(dash: string, cap = 'butt') {
  return (c: DrawCtx) => `<path d="M${r2(c.sw / 2)} ${r2(c.h / 2)} H${r2(c.w - c.sw / 2)}" stroke="${c.stroke}" stroke-width="${r2(Math.max(0.5, c.sw))}" stroke-linecap="${cap}" ${dash ? `stroke-dasharray="${dash.split(' ').map((d) => r2(Number(d) * Math.max(1, c.sw / 2))).join(' ')}"` : ''}/>`;
}

// ---------------------------------------------------------------- text and labels

const tx = category('Text and labels');
const T = (key: string, name: string, preset: TextPreset, w: number, h: number, keywords: string[] = []) =>
  tx(key, name, { creates: 'text', text: preset, width: w, height: h, layer: 'labels', fill: preset.fill ?? '#ffffff', stroke: preset.stroke ?? P.ink, strokeWidth: preset.strokeWidth ?? 0, keywords: ['text', 'label', ...keywords] });

export const TEXTS = [
  T('label-space-number', 'Parking-space number', { text: 'A12', fontSize: 16, color: P.ink }, 50, 24, ['number', 'stall']),
  T('label-space-custom', 'Custom parking-space label', { text: 'MANAGER', fontSize: 11, color: P.ink, fill: '#ffffff', stroke: P.ink, strokeWidth: 1 }, 70, 20, ['reserved for']),
  T('label-row', 'Row label', { text: 'ROW A', fontSize: 18, color: '#ffffff', fill: '#1f3a5f', strokeWidth: 0 }, 90, 30, ['row']),
  T('label-section', 'Section label', { text: 'SECTION 1', fontSize: 20, color: '#1f3a5f', fill: '#ffffff', stroke: '#1f3a5f', strokeWidth: 2 }, 130, 34, ['section']),
  T('label-zone', 'Zone label', { text: 'ZONE B', fontSize: 20, color: '#ffffff', fill: P.teal }, 110, 32, ['zone']),
  T('label-floor', 'Floor number', { text: 'LEVEL 2', fontSize: 26, color: '#ffffff', fill: '#c8102e' }, 130, 40, ['level', 'floor', 'deck']),
  T('label-building', 'Building name', { text: 'Main Building', fontSize: 22, color: P.ink }, 180, 32, ['building', 'name']),
  T('label-entrance', 'Entrance label', { text: 'ENTRANCE', fontSize: 16, color: '#ffffff', fill: P.go }, 110, 28, ['entrance', 'in']),
  T('label-exit', 'Exit label', { text: 'EXIT', fontSize: 16, color: '#ffffff', fill: P.danger }, 70, 28, ['exit', 'out']),
  T('label-road', 'Road name', { text: 'Main St', fontSize: 15, color: '#ffffff', fill: '#1d6b3a', stroke: '#ffffff', strokeWidth: 1.5 }, 100, 26, ['street', 'road', 'name']),
  T('label-directional', 'Directional text', { text: 'Service Drive →', fontSize: 15, color: P.ink }, 150, 26, ['direction', 'this way']),
  T('label-location', 'Location description', { text: 'Behind the showroom, next to the car wash', fontSize: 12, color: P.ink, fill: '#ffffff', fillOpacity: 0.9, stroke: P.inkSoft, strokeWidth: 1 }, 190, 44, ['description', 'where']),
  T('label-instructions', 'Employee instructions', { text: 'Employees: park in rows K–M only', fontSize: 12, color: P.ink, fill: '#fff4c2', stroke: '#c9a227', strokeWidth: 1 }, 200, 44, ['instructions', 'staff', 'note']),
  T('label-warning', 'Warning text', { text: 'CAUTION: LOW CLEARANCE', fontSize: 13, color: P.danger, fill: '#fde8e6', stroke: P.danger, strokeWidth: 1.5 }, 200, 30, ['warning', 'caution']),
  T('label-notes', 'Notes', { text: 'Notes', fontSize: 12, color: P.ink, fill: '#fff4c2', stroke: '#c9a227', strokeWidth: 1 }, 160, 60, ['note', 'memo', 'sticky']),
  T('label-textbox', 'Custom text box', { text: 'Text', fontSize: 14, color: P.ink, fill: '#ffffff', stroke: P.ink, strokeWidth: 1 }, 120, 32, ['text box', 'custom']),
  tx('marker-number', 'Numbered marker', { draw: disc('1'), width: 30, height: 30, layer: 'labels', fill: P.info, stroke: '#ffffff', strokeWidth: 1.5, label: '1', labelPos: 'inside', keywords: ['number', 'marker', 'callout', 'key'] }),
  tx('marker-letter', 'Lettered marker', { draw: disc('A'), width: 30, height: 30, layer: 'labels', fill: P.violet, stroke: '#ffffff', strokeWidth: 1.5, label: 'A', labelPos: 'inside', keywords: ['letter', 'marker', 'callout', 'key'] }),
  T('label-inventory-row', 'Inventory row number', { text: 'INV 12', fontSize: 16, color: '#ffffff', fill: P.violet }, 80, 28, ['inventory', 'stock row']),
  T('label-department', 'Department name', { text: 'SERVICE', fontSize: 18, color: '#ffffff', fill: P.orange }, 120, 30, ['department']),
  T('label-area', 'Custom area label', { text: 'Area name', fontSize: 16, color: P.ink, fill: '#ffffff', fillOpacity: 0.85 }, 120, 28, ['area', 'custom']),
  T('label-legend', 'Map legend', { text: 'LEGEND\n■ Customer parking\n■ Employee parking\n■ Valet staging', fontSize: 12, color: P.ink, fill: '#ffffff', stroke: P.ink, strokeWidth: 1 }, 170, 84, ['legend', 'key']),
  T('label-custom', 'Custom text label', { text: 'Label', fontSize: 16, color: P.ink }, 100, 28, ['custom', 'text']),
];

// ---------------------------------------------------------------- location markers

const mk = category('Location markers');
const PIN = { layer: 'labels' as const, width: 30, height: 39, stroke: '#ffffff', strokeWidth: 1.5, labelPos: 'below' as const };
const M = (key: string, name: string, g: string, color: string, keywords: string[] = []) => mk(key, name, { ...PIN, draw: pin(g), fill: color, keywords: ['pin', 'marker', 'point', ...keywords] });

export const MARKERS = [
  M('pin-general', 'General location pin', 'pin', P.danger, ['location', 'here']),
  M('pin-guest-pickup', 'Guest pickup point', 'carIn', P.teal, ['pickup', 'guest']),
  M('pin-dropoff', 'Vehicle drop-off point', 'car', P.info, ['drop off', 'arrival']),
  M('pin-meeting', 'Meeting point', 'meet', P.info, ['meet', 'rendezvous']),
  M('pin-emergency-meeting', 'Emergency meeting point', 'meet', P.go, ['assembly', 'muster', 'evacuation']),
  M('pin-key-pickup', 'Key pickup point', 'key', '#b08d1e', ['keys', 'pickup']),
  M('pin-key-return', 'Key return point', 'key', P.violet, ['keys', 'return', 'drop box']),
  M('pin-temporary', 'Temporary marker', 'clock', P.orange, ['temporary', 'today']),
  M('pin-important', 'Important location marker', 'star', P.danger, ['important', 'priority']),
  M('pin-warning', 'Warning marker', 'alert', '#c99a00', ['warning', 'caution', 'hazard']),
  mk('pin-custom', 'Custom pin', { ...PIN, also: ['Custom and reusable'], draw: pin(), fill: P.teal, label: 'A', labelPos: 'inside', keywords: ['custom', 'pin'] }),
  mk('pin-number', 'Custom numbered marker', { ...PIN, draw: pin(), fill: P.info, label: '1', labelPos: 'inside', keywords: ['number', 'numbered'] }),
  mk('pin-letter', 'Custom lettered marker', { ...PIN, draw: pin(), fill: P.violet, label: 'A', labelPos: 'inside', keywords: ['letter', 'lettered'] }),
];

// ---------------------------------------------------------------- background and reference

const bg = category('Background and reference');
const upload = (key: string, name: string, note: string, keywords: string[] = [], creates: AssetDef['creates'] = 'background') =>
  bg(key, name, { creates, width: 0, height: 0, layer: 'background', fill: '#ffffff', stroke: P.ink, strokeWidth: 0, note, keywords: ['upload', 'image', 'background', ...keywords] });

const grid = (minor: number, major: number) => (c: DrawCtx) => {
  let d = '';
  let D = '';
  for (let x = 0; x <= c.w; x += minor) (Math.round(x) % major === 0 ? (D += `M${x} 0V${c.h}`) : (d += `M${x} 0V${c.h}`));
  for (let y = 0; y <= c.h; y += minor) (Math.round(y) % major === 0 ? (D += `M0 ${y}H${c.w}`) : (d += `M0 ${y}H${c.w}`));
  return `<rect width="${c.w}" height="${c.h}" ${F(c)}/><path d="${d}" stroke="${c.stroke}" stroke-opacity="0.35" stroke-width="0.6"/><path d="${D}" stroke="${c.stroke}" stroke-opacity="0.7" stroke-width="${r2(Math.max(0.5, c.sw))}"/>`;
};

export const BACKGROUNDS = [
  upload('bg-satellite', 'Satellite imagery overlay', 'Upload a satellite screenshot you have the rights to use. Live satellite maps need a licensed map provider, which is a later step.', ['satellite', 'aerial', 'map']),
  upload('bg-aerial', 'Aerial photograph', 'Upload an aerial or drone photo as the floor background.', ['aerial', 'drone', 'photo']),
  upload('bg-site-photo', 'Uploaded site photograph', 'Upload a photo of the site as the floor background.', ['photo', 'site']),
  upload('bg-floor-plan', 'Uploaded floor plan', 'Upload a floor plan image (PNG or JPG) as the floor background.', ['floor plan', 'plan']),
  upload('bg-blueprint', 'Architectural blueprint', 'Upload a blueprint image (PNG or JPG) as the floor background.', ['blueprint', 'architectural', 'cad']),
  bg('bg-pdf', 'PDF reference', { creates: 'soon', width: 0, height: 0, layer: 'background', fill: '#fff', stroke: P.ink, strokeWidth: 0, keywords: ['pdf', 'document'], note: 'PDF import is coming next. For now, export the PDF page as a PNG and upload it as a floor plan.' }),
  upload('bg-image-ref', 'Image reference', 'Places an image on the map as an object you can move, resize, and fade.', ['reference', 'picture'], 'image'),
  bg('bg-plain', 'Plain background', { draw: (c) => boxRect(c), width: 800, height: 560, layer: 'structure', fill: '#f4f2ee', stroke: P.concreteEdge, strokeWidth: 0, keywords: ['background', 'canvas', 'base'] }),
  bg('bg-grid', 'Grid background', { draw: grid(25, 125), width: 800, height: 560, layer: 'structure', fill: '#ffffff', stroke: '#9fb3c8', strokeWidth: 0.8, keywords: ['grid', 'graph paper'] }),
  bg('bg-measure-grid', 'Measurement grid', {
    width: 500, height: 300, layer: 'structure', fill: '#ffffff', fillOpacity: 0.6, stroke: '#5f7fa3', strokeWidth: 1, keywords: ['measure', 'feet', 'scale', 'grid'],
    draw: (c) => {
      let labels = '';
      for (let x = 50; x < c.w; x += 50) labels += text(x, 7, 7, `${x / 5}'`, '#5f7fa3');
      for (let y = 50; y < c.h; y += 50) labels += text(9, y, 7, `${y / 5}'`, '#5f7fa3');
      return grid(10, 50)(c) + labels;
    },
  }),
  bg('bg-guides', 'Alignment guides', {
    width: 400, height: 300, layer: 'labels', fill: '#ffffff', fillable: false, stroke: '#00a3c4', strokeWidth: 1, keywords: ['guides', 'crosshair', 'center line'],
    draw: (c) => `<path d="M${r2(c.w / 2)} 0V${c.h}M0 ${r2(c.h / 2)}H${c.w}M0 ${r2(c.h / 4)}H${c.w}M0 ${r2(c.h * 0.75)}H${c.w}M${r2(c.w / 4)} 0V${c.h}M${r2(c.w * 0.75)} 0V${c.h}" stroke="${c.stroke}" stroke-width="${c.sw}" stroke-dasharray="6 4"/>`,
  }),
  bg('bg-map-boundary', 'Map boundary', { draw: outline(true), width: 800, height: 560, layer: 'structure', fill: '#ffffff', fillOpacity: 0, stroke: P.ink, strokeWidth: 3, keywords: ['border', 'frame', 'extent'] }),
  bg('scale-bar', 'Scale indicator', {
    width: 120, height: 30, layer: 'labels', fill: P.ink, stroke: P.ink, strokeWidth: 1, keywords: ['scale bar', 'feet', 'distance'],
    draw: (c) => {
      const seg = (c.w - 10) / 4;
      const ft = Math.round((c.w - 10) / 5);
      let s = '';
      for (let i = 0; i < 4; i++) s += `<rect x="${r2(5 + i * seg)}" y="${r2(c.h * 0.5)}" width="${r2(seg)}" height="${r2(c.h * 0.22)}" fill="${i % 2 ? '#ffffff' : c.fill}" fill-opacity="${i % 2 ? 1 : c.fo}" ${S(c)}/>`;
      return `${s}${text(5, c.h * 0.25, 8, '0', P.ink)}${text(5 + seg * 2, c.h * 0.25, 8, `${ft / 2}`, P.ink)}${text(c.w - 5, c.h * 0.25, 8, `${ft} ft`, P.ink, 'text-anchor="end"')}`;
    },
  }),
  bg('north-arrow', 'North indicator', {
    width: 40, height: 52, layer: 'labels', fill: P.ink, stroke: P.ink, strokeWidth: 1, keywords: ['north', 'compass', 'orientation'],
    draw: icon(40, 52, (c) => `${text(20, 7, 10, 'N', P.ink)}<path d="M20 14 31 48 20 41 9 48Z" fill="#ffffff" ${S(c)}/><path d="M20 14V41L9 48Z" ${F(c)}/>`),
  }),
];

// ---------------------------------------------------------------- drawing elements

const dr = category('Drawing elements');
const LINE = { layer: 'labels' as const, fill: P.ink, fillable: false, stroke: P.ink, strokeWidth: 2, width: 200, height: 12 };
const soon = (cat: ReturnType<typeof category>, key: string, name: string, note: string, keywords: string[] = []) =>
  cat(key, name, { creates: 'soon', width: 0, height: 0, layer: 'labels', fill: '#fff', stroke: P.ink, strokeWidth: 1, note, keywords });

const dimension = (ticks: 'ticks' | 'arrows') => (c: DrawCtx) => {
  const y = c.h * 0.62;
  const ft = Math.round(c.w / 5);
  const t = c.label || `${ft} ft`;
  const ends = ticks === 'ticks'
    ? `<path d="M${r2(c.sw / 2)} ${r2(y - 6)}v12M${r2(c.w - c.sw / 2)} ${r2(y - 6)}v12" stroke="${c.stroke}" stroke-width="${r2(Math.max(1, c.sw))}"/>`
    : `<path d="M${r2(c.sw / 2)} 0V${c.h}M${r2(c.w - c.sw / 2)} 0V${c.h}" stroke="${c.stroke}" stroke-width="0.8" stroke-dasharray="2 2"/><path d="M2 ${r2(y)}l8 -4v8ZM${r2(c.w - 2)} ${r2(y)}l-8 -4v8Z" fill="${c.stroke}"/>`;
  return `${hLine(y, c.sw / 2, c.w - c.sw / 2, c.stroke, Math.max(0.5, c.sw))}${ends}<rect x="${r2(c.w / 2 - t.length * 3.2)}" y="${r2(y - 15)}" width="${r2(t.length * 6.4)}" height="11" fill="#ffffff" fill-opacity="0.85"/>${text(c.w / 2, y - 9.5, 9, t, c.stroke)}`;
};

export const DRAWING = [
  dr('line', 'Straight line', { ...LINE, draw: dashLine(''), keywords: ['line', 'stroke'] }),
  dr('curved-line', 'Curved line', {
    ...LINE, width: 160, height: 80, keywords: ['arc', 'curve'],
    draw: (c) => `<path d="M${r2(c.sw)} ${r2(c.h - c.sw)} Q${r2(c.w / 2)} ${r2(-c.h + c.sw * 2)} ${r2(c.w - c.sw)} ${r2(c.h - c.sw)}" fill="none" stroke="${c.stroke}" stroke-width="${r2(Math.max(0.5, c.sw))}" stroke-linecap="round"/>`,
  }),
  soon(dr, 'freeform-line', 'Freeform line', 'Freehand drawing is part of the next stage, with polygons and custom shapes.', ['pen', 'freehand', 'sketch']),
  dr('rectangle', 'Rectangle', { draw: (c) => boxRect(c), width: 140, height: 90, layer: 'labels', fill: '#dbe6f7', stroke: P.info, strokeWidth: 2, keywords: ['box', 'square', 'shape'] }),
  dr('rounded-rect', 'Rounded rectangle', { draw: (c) => boxRect(c, Math.min(c.w, c.h) * 0.18), width: 140, height: 90, layer: 'labels', fill: '#dbe6f7', stroke: P.info, strokeWidth: 2, keywords: ['rounded', 'pill', 'shape'] }),
  dr('circle', 'Circle', { draw: ellipse, width: 100, height: 100, layer: 'labels', fill: '#dbe6f7', stroke: P.info, strokeWidth: 2, keywords: ['round', 'shape', 'dot'] }),
  dr('oval', 'Oval', { draw: ellipse, width: 150, height: 90, layer: 'labels', fill: '#dbe6f7', stroke: P.info, strokeWidth: 2, keywords: ['ellipse', 'shape'] }),
  soon(dr, 'polygon', 'Polygon', 'Point-by-point polygons are part of the next stage.', ['shape', 'polygon']),
  soon(dr, 'custom-shape', 'Custom shape', 'Custom shapes are part of the next stage, with polygons and freehand lines.', ['shape']),
  dr('dashed-line', 'Dashed line', { ...LINE, draw: dashLine('8 5'), keywords: ['dash', 'line'] }),
  dr('dotted-line', 'Dotted line', { ...LINE, draw: dashLine('0.1 4', 'round'), strokeWidth: 3, keywords: ['dots', 'line'] }),
  dr('connector-line', 'Connector line', {
    ...LINE, keywords: ['connector', 'arrow line', 'leader'],
    draw: (c) => `<circle cx="${r2(4)}" cy="${r2(c.h / 2)}" r="3.5" fill="${c.stroke}"/>${hLine(c.h / 2, 4, c.w - 10, c.stroke, Math.max(0.5, c.sw))}<path d="M${r2(c.w - 1)} ${r2(c.h / 2)}l-10 -5v10Z" fill="${c.stroke}"/>`,
  }),
  dr('measure-line', 'Measurement line', { ...LINE, height: 28, draw: dimension('ticks'), strokeWidth: 1.5, labelPos: 'inside', keywords: ['measure', 'distance', 'feet', 'length'], note: 'Shows its length in feet (5 px = 1 ft) unless you type a label.' }),
  dr('dimension', 'Dimension indicator', { ...LINE, height: 30, draw: dimension('arrows'), strokeWidth: 1, labelPos: 'inside', keywords: ['dimension', 'size', 'width'], note: 'Shows its length in feet (5 px = 1 ft) unless you type a label.' }),
  dr('highlight', 'Highlight overlay', { draw: (c) => boxRect(c, 4), width: 200, height: 120, layer: 'labels', fill: '#ffe14d', fillOpacity: 0.35, stroke: '#e0b800', strokeWidth: 0, keywords: ['highlight', 'emphasis', 'marker'] }),
  dr('overlay', 'Transparent overlay', { draw: (c) => boxRect(c), width: 200, height: 120, layer: 'labels', fill: '#ffffff', fillOpacity: 0.5, stroke: P.inkSoft, strokeWidth: 0, keywords: ['overlay', 'mask', 'fade', 'tint'] }),
  dr('selection-boundary', 'Selection boundary', {
    draw: (c) => `${boxRect(c, 0, `stroke-dasharray="${r2(c.sw * 3)} ${r2(c.sw * 2)}"`)}${[[0, 0], [c.w, 0], [0, c.h], [c.w, c.h]].map(([x, y]) => `<rect x="${r2(Math.min(Math.max(x - 4, 0), c.w - 8))}" y="${r2(Math.min(Math.max(y - 4, 0), c.h - 8))}" width="8" height="8" fill="#fff" stroke="${c.stroke}" stroke-width="1.2"/>`).join('')}`,
    width: 200, height: 120, layer: 'labels', fill: P.info, fillOpacity: 0.06, stroke: P.info, strokeWidth: 1.5, keywords: ['selection', 'frame', 'callout box'],
  }),
];

// ---------------------------------------------------------------- custom and reusable

const cu = category('Custom and reusable');

export const CUSTOM: AssetDef[] = [
  cu('custom-space', 'Custom parking-space template', { creates: 'space', variant: 'standard', width: 45, height: 90, layer: 'spaces', fill: '#ffffff', stroke: '', strokeWidth: 1.5, namePrefix: 'Space', keywords: ['space', 'template'], note: 'A plain space to restyle: change its fill, border, size and markings.' }),
  cu('custom-row', 'Custom parking-row template', { creates: 'row', width: 0, height: 0, layer: 'spaces', fill: '#ffffff', stroke: P.ink, strokeWidth: 1.5, keywords: ['row', 'template'], note: 'Opens the row builder: pick the count, numbering and space size.' }),
  cu('custom-road', 'Custom road template', { draw: lane(() => ''), width: 300, height: 60, layer: 'structure', fill: P.asphalt, stroke: P.asphaltEdge, strokeWidth: 0, labelColor: '#ffffff', keywords: ['road', 'lane', 'template'] }),
  cu('custom-symbol', 'Custom symbol', { draw: disc('★'), width: 34, height: 34, layer: 'labels', fill: P.teal, stroke: '#ffffff', strokeWidth: 1.5, label: '★', labelPos: 'inside', keywords: ['symbol', 'icon', 'custom'] }),
  cu('custom-building', 'Custom building shape', { draw: building(), width: 240, height: 160, layer: 'structure', fill: P.building, stroke: P.wall, strokeWidth: 2.5, label: 'Building', labelPos: 'center', keywords: ['building', 'custom'] }),
  cu('custom-marker', 'Custom marker', { draw: pin('pin'), width: 30, height: 39, layer: 'labels', fill: P.teal, stroke: '#ffffff', strokeWidth: 1.5, label: 'Marker', labelPos: 'below', keywords: ['marker', 'custom'] }),
  soon(cu, 'custom-group', 'Custom grouped object', 'Grouping several objects into one reusable piece is part of the next stage.', ['group', 'combine']),
  soon(cu, 'saved-template', 'Saved asset template', 'Saving your own styled objects as templates is part of the next stage.', ['template', 'save', 'favorite']),
  soon(cu, 'company-asset', 'Company-specific asset', 'Company asset libraries arrive with accounts (the next phase), so every site in a company shares them.', ['company', 'brand', 'shared']),
  cu('import-svg', 'Imported SVG asset', { creates: 'image', width: 0, height: 0, layer: 'landmarks', fill: '#ffffff', stroke: P.ink, strokeWidth: 0, note: 'Upload an SVG you have the rights to use. It becomes an object you can move, resize and fade.', keywords: ['svg', 'vector', 'import', 'upload'] }),
  cu('import-image', 'Imported image asset', { creates: 'image', width: 0, height: 0, layer: 'landmarks', fill: '#ffffff', stroke: P.ink, strokeWidth: 0, note: 'Upload a PNG or JPG you have the rights to use. It becomes an object you can move, resize and fade.', keywords: ['image', 'photo', 'logo', 'import', 'upload'] }),
];

export const TEXT_LABEL_ALSO: { key: string; also: AssetCategory[] }[] = [{ key: 'label-custom', also: ['Custom and reusable'] }];
