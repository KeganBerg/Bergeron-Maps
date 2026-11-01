import { category } from '../defs';
import { badge, pin, raisedShadow, vehicle, zone } from '../draw';
import { glyph } from '../glyphs';
import { FS, icon, P, S, text } from '../style';

const v = category('Valet operations');

const area = (key: string, name: string, g: string, color: string, keywords: string[] = [], w = 200, h = 120) =>
  v(key, name, {
    draw: zone({ glyph: g }), width: w, height: h, layer: 'structure', fill: color, fillOpacity: 0.16, stroke: color, strokeWidth: 2,
    label: name.replace(/^Vehicle /, ''), labelPos: 'badge', keywords: ['valet', ...keywords],
  });

export const VALET = [
  v('valet-booth', 'Valet booth', {
    width: 60, height: 50, layer: 'landmarks', fill: '#0f7c74', stroke: P.ink, strokeWidth: 1.2, keywords: ['stand', 'kiosk', 'attendant', 'hut'],
    labelPos: 'below',
    draw: icon(60, 50, (c) => `${raisedShadow(4, 4, 52, 40, 3, 2)}<rect x="4" y="4" width="52" height="40" rx="3" ${FS(c)}/><rect x="8" y="8" width="44" height="32" rx="1.5" fill="#000" fill-opacity="0.08"/><path d="M8 24h44" stroke="#fff" stroke-opacity="0.35" stroke-width="1"/><rect x="10" y="40" width="40" height="7" rx="1" fill="${P.glass}" stroke="${P.glassDark}" stroke-width="0.8"/>${text(30, 24, 10, 'VALET', '#ffffff')}`),
  }),
  v('valet-podium', 'Valet podium', {
    width: 36, height: 30, layer: 'landmarks', fill: '#2d3e50', stroke: P.ink, strokeWidth: 1.2, keywords: ['stand', 'desk', 'lectern'], labelPos: 'below',
    draw: icon(36, 30, (c) => `${raisedShadow(5, 5, 26, 18, 2)}<path d="M5 5h26l-3 18H8Z" ${FS(c)}/><rect x="9" y="8" width="18" height="8" rx="1" fill="#fff" fill-opacity="0.85"/><path d="M12 11h12M12 13.5h8" stroke="${P.inkSoft}" stroke-width="0.8"/>${glyph('key', 18, 26.5, 6, c.fill)}`),
  }),
  v('key-box', 'Key storage station', {
    width: 40, height: 30, layer: 'landmarks', fill: '#c9a227', stroke: P.ink, strokeWidth: 1.2, keywords: ['key', 'keys', 'lockbox', 'cabinet'], labelPos: 'below',
    draw: icon(40, 30, (c) => {
      let hooks = '';
      for (let r = 0; r < 2; r++) for (let i = 0; i < 5; i++) hooks += `<circle cx="${9 + i * 5.5}" cy="${11 + r * 8}" r="1.6" fill="${P.ink}"/><path d="M${9 + i * 5.5} ${12.6 + r * 8}v2.4" stroke="${P.ink}" stroke-width="0.9"/>`;
      return `${raisedShadow(3, 3, 34, 24, 2)}<rect x="3" y="3" width="34" height="24" rx="2" ${FS(c)}/><rect x="5.5" y="5.5" width="29" height="19" rx="1" fill="#fff" fill-opacity="0.9"/>${hooks}`;
    }),
  }),
  area('valet-pickup', 'Vehicle pickup area', 'carIn', P.go, ['pickup', 'return', 'collect']),
  area('valet-dropoff', 'Vehicle drop-off area', 'car', P.info, ['drop off', 'dropoff', 'arrival']),
  area('valet-staging', 'Vehicle staging area', 'queue', P.violet, ['staging', 'hold', 'ready line']),
  v('valet-queue', 'Vehicle queue', {
    width: 220, height: 60, layer: 'structure', fill: P.violet, fillOpacity: 0.1, stroke: P.violet, strokeWidth: 2, keywords: ['valet', 'line', 'wait', 'stack'],
    label: 'Queue', labelPos: 'center',
    draw: (c) => {
      const n = Math.max(1, Math.floor(c.w / 55));
      let cars = '';
      for (let i = 0; i < n; i++) {
        const x = c.w - 30 - i * 55;
        cars += `<rect x="${x - 19}" y="${c.h / 2 - 10}" width="38" height="20" rx="6" fill="none" stroke="${c.stroke}" stroke-width="1.2" stroke-dasharray="3 2"/>`;
      }
      return `<rect x="${c.sw / 2}" y="${c.sw / 2}" width="${c.w - c.sw}" height="${c.h - c.sw}" rx="4" fill="${c.fill}" fill-opacity="${c.fo}" ${S(c)} stroke-dasharray="${c.sw * 4} ${c.sw * 2.5}"/>${cars}<path d="M${c.w - 8} ${c.h / 2}l-8-6v12Z" fill="${c.stroke}"/>`;
    },
  }),
  v('key-handoff', 'Key handoff location', {
    draw: pin('handoff'), width: 30, height: 39, layer: 'landmarks', fill: '#c9a227', stroke: P.ink, strokeWidth: 1, keywords: ['valet', 'key', 'handoff', 'exchange'], labelPos: 'below',
  }),
  v('supervisor-station', 'Supervisor station', {
    width: 50, height: 40, layer: 'landmarks', fill: '#4b5d73', stroke: P.ink, strokeWidth: 1.2, keywords: ['valet', 'manager', 'lead', 'desk'], labelPos: 'below',
    draw: icon(50, 40, (c) => `${raisedShadow(4, 6, 42, 16, 2)}<rect x="4" y="6" width="42" height="16" rx="2" ${FS(c)}/><rect x="8" y="9" width="12" height="8" rx="1" fill="${P.glass}"/><circle cx="25" cy="31" r="6" fill="${P.steel}" stroke="${P.ink}" stroke-width="1"/><path d="M19.5 27.5a6 6 0 0 1 11 0" stroke="${P.ink}" stroke-width="2" fill="none"/>${badge('shield', 38, 14, 5.5, c.fill)}`),
  }),
  area('guest-waiting', 'Guest waiting area', 'sofa', P.teal, ['guest', 'wait', 'seating']),
  area('event-parking', 'Event parking area', 'ticket', P.orange, ['event', 'overflow'], 260, 160),
  area('vehicle-inspection-area', 'Vehicle inspection area', 'clipboard', P.info, ['damage', 'walkaround', 'check']),
];

const vc = category('Vehicles');
const veh = (key: string, name: string, w: number, h: number, spec: Parameters<typeof vehicle>[0], fill: string, keywords: string[] = []) =>
  vc(key, name, { draw: vehicle(spec), width: w, height: h, layer: 'landmarks', fill, stroke: P.ink, strokeWidth: 1, keywords: ['vehicle', 'car', 'auto', ...keywords], labelPos: 'below' });

export const VEHICLES = [
  veh('car', 'Sedan', 31, 80, { W: 30, L: 78, r: 8, hood: 18, ws: 11, roof: 22, rw: 9 }, '#5b8fd6', ['sedan', 'four door']),
  veh('suv', 'SUV', 33, 86, { W: 32, L: 84, r: 6, hood: 18, ws: 10, roof: 36, rw: 6, rails: true }, '#6b7682', ['crossover', 'jeep']),
  veh('truck', 'Pickup truck', 34, 102, { W: 33, L: 100, r: 5, hood: 20, ws: 10, roof: 20, rw: 4, bed: 40 }, '#b5473a', ['truck', 'pickup']),
  veh('van', 'Van', 34, 96, { W: 33, L: 94, r: 5, hood: 10, ws: 9, roof: 70, rw: 0 }, '#e9ecef', ['cargo van', 'sprinter']),
  veh('coupe', 'Coupe', 30, 76, { W: 29, L: 74, r: 9, hood: 20, ws: 13, roof: 16, rw: 10 }, '#d0582d', ['two door']),
  veh('convertible', 'Convertible', 30, 76, { W: 29, L: 74, r: 9, hood: 20, ws: 9, roof: 24, rw: 0, open: true }, '#c43d4f', ['cabrio', 'roadster', 'top down']),
  veh('sports-car', 'Sports car', 32, 74, { W: 31, L: 72, r: 11, hood: 24, ws: 13, roof: 12, rw: 9 }, '#e8b422', ['performance', 'supercar']),
  veh('hatchback', 'Hatchback', 30, 70, { W: 29, L: 68, r: 8, hood: 15, ws: 11, roof: 28, rw: 6 }, '#3f9e7a', ['compact car']),
  veh('minivan', 'Minivan', 33, 88, { W: 32, L: 86, r: 9, hood: 14, ws: 13, roof: 46, rw: 6, sliding: true }, '#8a96a3', ['family', 'people mover']),
  veh('commercial-truck', 'Commercial truck', 42, 132, { W: 40, L: 130, r: 3, hood: 10, ws: 8, roof: 14, rw: 0, boxFrom: 36 }, '#f2f2f2', ['box truck', 'delivery', 'lorry']),
  vc('motorcycle', 'Motorcycle', {
    width: 14, height: 40, layer: 'landmarks', fill: '#2f3a48', stroke: P.ink, strokeWidth: 1, keywords: ['motorbike', 'bike', 'scooter'], labelPos: 'below',
    draw: icon(16, 42, (c) => `<ellipse cx="9" cy="22" rx="5" ry="18" fill="${P.shadow}"/><rect x="6" y="2" width="4" height="9" rx="2" fill="${P.ink}"/><rect x="6" y="31" width="4" height="9" rx="2" fill="${P.ink}"/><path d="M2 12h12" stroke="${P.ink}" stroke-width="1.6" stroke-linecap="round"/><path d="M8 9c3 0 4 2 4 6v12c0 3-2 5-4 5s-4-2-4-5V15c0-4 1-6 4-6Z" ${FS(c)}/><rect x="6" y="20" width="4" height="9" rx="2" fill="${P.ink}" fill-opacity="0.6"/>`),
  }),
  veh('electric-vehicle', 'Electric vehicle', 31, 80, { W: 30, L: 78, r: 9, hood: 14, ws: 13, roof: 24, rw: 10, ev: true }, '#e6eaee', ['ev', 'electric', 'tesla', 'battery']),
  vc('car-transporter', 'Vehicle transport truck', {
    width: 44, height: 300, layer: 'landmarks', fill: '#c9302c', stroke: P.ink, strokeWidth: 1, keywords: ['car hauler', 'transporter', 'carrier', 'delivery', 'semi'], labelPos: 'below',
    draw: icon(44, 300, (c) => {
      let cars = '';
      for (let i = 0; i < 4; i++) cars += `<rect x="9" y="${66 + i * 57}" width="26" height="50" rx="7" fill="${['#5b8fd6', '#e6eaee', '#6b7682', '#3f9e7a'][i]}" stroke="${P.ink}" stroke-width="0.8"/><rect x="12" y="${78 + i * 57}" width="20" height="7" rx="1.5" fill="${P.glass}"/>`;
      return `<rect x="3.5" y="3.5" width="40" height="295" rx="3" fill="${P.shadow}"/><rect x="4" y="2" width="36" height="50" rx="5" ${FS(c)}/><path d="M8 12h28l-2 9H10Z" fill="${P.glass}" stroke="${P.glassDark}" stroke-width="0.6"/><rect x="2" y="56" width="40" height="242" rx="2" fill="${P.steel}" stroke="${P.ink}" stroke-width="1"/><path d="M6 60v234M38 60v234" stroke="${P.steelDark}" stroke-width="2"/>${cars}`;
    }),
  }),
];
