/**
 * The Bergeron Maps asset style standard, as code. Every base asset draws with
 * these colors and helpers so the whole library reads as one family:
 * a simplified architectural site plan, seen from above, with recognizable
 * real-world objects. The written version is docs/ASSET_STYLE.md.
 */

/** Restrained, real-world palette. Equivalent things always use the same color. */
import type { SymbolChoice } from './symbols';

export const P = {
  // Outlines and detail
  ink: '#27313d', // outline of every raised object
  inkSoft: '#5d6875', // secondary detail lines
  shadow: 'rgba(16,24,40,0.16)', // the one subtle drop shadow raised objects get

  // Ground surfaces
  asphalt: '#6f7681',
  asphaltEdge: '#555c66',
  concrete: '#dcd8d0',
  concreteEdge: '#a9a49a',
  grass: '#a8cf8a',
  grassEdge: '#79a85d',
  soil: '#a7865f',
  mulch: '#8c6b4a',
  gravel: '#cdc6b8',
  water: '#9dcbe6',
  waterEdge: '#5e9fc8',

  // Pavement paint
  paint: '#ffffff',
  paintYellow: '#f2c230',
  paintBlue: '#2f62c4',
  paintRed: '#d23a32',

  // Materials
  foliage: '#6aa84f',
  foliageDark: '#4b8a3a',
  foliageLight: '#8cc46d',
  trunk: '#7a5634',
  glass: '#b4cadb',
  glassDark: '#6d8aa3',
  steel: '#a3abb5',
  steelDark: '#6e7782',
  wall: '#4d5562',
  building: '#ebe6dc',
  roof: '#d6cfc1',
  room: '#f7f4ee',
  wood: '#b98a5a',

  // Signals
  safety: '#f2b705',
  danger: '#d23a32',
  go: '#1f8a4c',
  info: '#1f5fbf',
  accessible: '#1d4fbf',
  orange: '#ea7a1a',
  violet: '#6d4bb3',
  teal: '#0f7c74',
};

/** What a draw function gets: the object's real size in map pixels and its paint. */
export interface DrawCtx {
  w: number;
  h: number;
  fill: string;
  /** Fill opacity 0..1 */
  fo: number;
  stroke: string;
  /** Border thickness. 0 = no border. */
  sw: number;
  /** The object's on-map label, for assets that print it on themselves (custom signs, markers). */
  label: string;
  /** Symbol override: missing = the asset's own symbol, null = none, else a chosen Material symbol. */
  symbol?: SymbolChoice;
}

export type DrawFn = (c: DrawCtx) => string;

export const r2 = (v: number) => Math.round(v * 100) / 100;

/** Fill attributes for the recolorable main surface. */
export const F = (c: DrawCtx) => `fill="${c.fill}" fill-opacity="${c.fo}"`;
/** Border attributes, or no border at 0 px. */
export const S = (c: DrawCtx, color = c.stroke, sw = c.sw) =>
  sw > 0 ? `stroke="${color}" stroke-width="${r2(sw)}" stroke-linejoin="round"` : 'stroke="none"';
/** Main surface: fill + border. */
export const FS = (c: DrawCtx) => `${F(c)} ${S(c)}`;

/** A rectangle covering the whole box, inset so its border is never clipped. */
export const boxRect = (c: DrawCtx, rx = 0, extra = '') => {
  const i = c.sw / 2;
  return `<rect x="${r2(i)}" y="${r2(i)}" width="${r2(Math.max(0, c.w - c.sw))}" height="${r2(Math.max(0, c.h - c.sw))}" rx="${rx}" ${FS(c)} ${extra}/>`;
};

/**
 * Wraps a fixed design drawn in a vw × vh box so it scales to the object's
 * size. Icons keep their proportions: a stretched box makes the icon larger
 * and centers it, it never squashes it. The border width is converted so
 * 2 px on the map stays 2 px.
 */
export function icon(vw: number, vh: number, body: DrawFn): DrawFn {
  return (c) => {
    const k = Math.min(c.w / vw, c.h / vh) || 1;
    const dx = (c.w - vw * k) / 2;
    const dy = (c.h - vh * k) / 2;
    return `<g transform="translate(${r2(dx)} ${r2(dy)}) scale(${r2(k)})">${body({ ...c, w: vw, h: vh, sw: c.sw / k })}</g>`;
  };
}

/** Stand-alone SVG document at the object's size (rendered at 2x for crisp zoom). */
export function svgDoc(w: number, h: number, body: string): string {
  const W = Math.max(1, r2(w));
  const H = Math.max(1, r2(h));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${r2(W * 2)}" height="${r2(H * 2)}" viewBox="0 0 ${W} ${H}">${body}</svg>`;
}

export function svgDataUrl(markup: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
}

/** #rrggbb + opacity → rgba(), for Konva fills. */
export function withAlpha(hex: string, a = 1): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m || a >= 1) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${Math.max(0, a)})`;
}

/** Darker shade of a color, for outlines that should match their fill. */
export function shade(hex: string, amount = 0.35): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const f = (v: number) => Math.round(v * (1 - amount)).toString(16).padStart(2, '0');
  return `#${f((n >> 16) & 255)}${f((n >> 8) & 255)}${f(n & 255)}`;
}

export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Sign and pavement lettering. A system font, because SVG images cannot load web fonts. */
export const SIGN_FONT = 'Arial, Helvetica, sans-serif';

export const text = (x: number, y: number, size: number, content: string, color: string, extra = '') =>
  `<text x="${r2(x)}" y="${r2(y)}" font-family="${SIGN_FONT}" font-size="${r2(size)}" font-weight="700" fill="${color}" ${extra.includes('text-anchor') ? '' : 'text-anchor="middle"'} dominant-baseline="central" ${extra}>${esc(content)}</text>`;

/** Fits text of n characters into a width. */
export const fitText = (width: number, chars: number, max: number) => Math.max(4, Math.min(max, (width / Math.max(chars, 1)) * 1.2));
