import type { LabelPlacement, SpaceVariant } from '../../model/types';
import { category } from '../defs';
import { glyph } from '../glyphs';
import { fitText, P, r2, text } from '../style';

const c = category('Parking spaces');
const sp = (key: string, name: string, variant: SpaceVariant, width: number, height: number, stroke: string, keywords: string[] = []) =>
  c(key, name, {
    creates: 'space', variant, width, height, layer: 'spaces', keywords: ['parking', 'stall', 'space', ...keywords],
    fill: '#ffffff', stroke, strokeWidth: 1.5, namePrefix: 'Space',
  });

/** Empty string = use the theme's line color. */
export const SPACES = [
  sp('space-standard', 'Standard parking space', 'standard', 45, 90, ''),
  sp('space-compact', 'Compact parking space', 'compact', 40, 80, ''),
  sp('space-oversized', 'Oversized parking space', 'oversized', 55, 105, '', ['large', 'truck']),
  sp('space-accessible', 'Accessible parking space', 'accessible', 75, 90, P.accessible, ['ada', 'handicap', 'disabled', 'wheelchair']),
  sp('space-reserved', 'Reserved parking space', 'reserved', 45, 90, ''),
  sp('space-vip', 'VIP parking space', 'vip', 50, 95, '#a8811a', ['premium']),
  sp('space-ev', 'EV charging space', 'ev', 45, 90, P.go, ['electric', 'charger', 'charging']),
  sp('space-motorcycle', 'Motorcycle parking space', 'motorcycle', 25, 45, '', ['bike', 'moto']),
  sp('space-loading', 'Loading zone', 'loading', 60, 150, '#b88a00', ['loading', 'delivery', 'truck']),
  sp('space-no-parking', 'No-parking space', 'no-parking', 45, 90, P.danger, ['restricted']),
  sp('space-angled', 'Angled parking space', 'angled', 80, 90, '', ['diagonal', 'slanted']),
  sp('space-parallel', 'Parallel parking space', 'parallel', 110, 45, '', ['curbside', 'street']),
  sp('space-double', 'Double-width parking space', 'double', 90, 90, '', ['wide', 'trailer']),
];

/** How far the angled stall leans: the parallelogram's horizontal offset. */
export const angledSkew = (w: number) => Math.max(0, w - Math.min(w, 45));

/** Outline points of a space (for the angled variant, a parallelogram). */
export function spaceOutline(variant: SpaceVariant, w: number, h: number): number[] {
  if (variant === 'angled') {
    const k = angledSkew(w);
    return [k, 0, w, 0, w - k, h, 0, h];
  }
  return [0, 0, w, 0, w, h, 0, h];
}

/**
 * Painted markings drawn on top of a space body: symbols and words in the
 * half of the space the number isn't using.
 */
export function spaceMarks(variant: SpaceVariant, w: number, h: number, place: LabelPlacement, stroke: string): string {
  const along = h >= w;
  const markY = place === 'bottom' ? h * 0.3 : place === 'top' ? h * 0.62 : h * 0.76;
  const s = Math.max(6, Math.min(w * 0.55, h * 0.24));
  const word = (t: string, color: string) => text(w / 2, markY, Math.min(s * 0.5, fitText(w * 0.85, t.length, 12)), t, color);
  const hatch = (color: string, x = 0, width = w) => {
    const id = `sh${variant}${Math.round(w)}${Math.round(h)}`;
    return `<defs><pattern id="${id}" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="3" height="10" fill="${color}"/></pattern></defs><rect x="${r2(x)}" y="0" width="${r2(width)}" height="${r2(h)}" fill="url(#${id})"/>`;
  };
  switch (variant) {
    case 'accessible': {
      const aisle = w / h >= 0.75 ? w * 0.38 : 0;
      const cx = (w - aisle) / 2;
      const ss = Math.max(6, Math.min((w - aisle) * 0.6, h * 0.26));
      return `${aisle ? hatch(P.accessible, w - aisle, aisle) + `<path d="M${r2(w - aisle)} 0 V${r2(h)}" stroke="${P.accessible}" stroke-width="1.5"/>` : ''}<rect x="${r2(cx - ss / 2)}" y="${r2(markY - ss / 2)}" width="${r2(ss)}" height="${r2(ss)}" rx="${r2(ss * 0.12)}" fill="${P.accessible}"/>${glyph('wheelchair', cx, markY, ss * 0.82, '#ffffff')}`;
    }
    case 'ev':
      return `<rect x="${r2(w / 2 - s / 2)}" y="${r2(markY - s / 2)}" width="${r2(s)}" height="${r2(s)}" rx="${r2(s * 0.2)}" fill="${P.go}"/>${glyph('bolt', w / 2, markY, s * 0.75, '#ffffff')}`;
    case 'vip':
      return `${glyph('star', w / 2, markY - s * 0.2, s * 0.7, '#c9a227')}${text(w / 2, markY + s * 0.42, Math.min(s * 0.36, 11), 'VIP', '#8a6d12')}`;
    case 'compact':
      return word('COMPACT', P.inkSoft);
    case 'oversized':
      return word('OVERSIZE', P.inkSoft);
    case 'reserved':
      return word('RESERVED', P.danger);
    case 'motorcycle':
      return glyph('moto', w / 2, markY, Math.min(w * 0.8, h * 0.3), P.inkSoft);
    case 'loading':
      return `${hatch('rgba(242,194,48,0.55)')}<rect x="${r2(w * 0.08)}" y="${r2(markY - s * 0.3)}" width="${r2(w * 0.84)}" height="${r2(s * 0.6)}" fill="#ffffff"/>${word('LOADING', '#8a6400')}`;
    case 'no-parking':
      return `${hatch('rgba(210,58,50,0.35)')}<rect x="${r2(w * 0.06)}" y="${r2(markY - s * 0.3)}" width="${r2(w * 0.88)}" height="${r2(s * 0.6)}" fill="#ffffff"/>${word(w < 60 ? 'NO PARK' : 'NO PARKING', P.danger)}`;
    case 'double':
      return glyph('doubleArrow', w / 2, markY, Math.min(w * 0.5, 26), P.inkSoft);
    case 'parallel':
      return along ? '' : `<path d="M${r2(w * 0.5)} ${r2(h - 1)} v${r2(-h * 0.2)}" stroke="${stroke || P.inkSoft}" stroke-width="1"/>`;
    default:
      return '';
  }
}
