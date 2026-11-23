import { MAP_FONT } from '../theme';

/**
 * Fits a label into a box: shrink to fit on one line, or break it onto two
 * lines ("F6" over "116") when that lets it stay larger. The text is measured
 * in the device's own bold UI font, and it keeps an inner margin so a number
 * never touches the lines of its space.
 */
const CHAR_W = 0.68; // fallback when there is no canvas to measure with (unit tests)
const LINE_H = 1.1;
const MIN_SIZE = 6;
/** Share of the box a label may use: about 15% clear on each side, 10% top and bottom. */
const FILL_W = 0.7;
const FILL_H = 0.8;

const FONT = `bold 100px ${MAP_FONT}`;
let ctx: CanvasRenderingContext2D | null | undefined;
const widths = new Map<string, number>();
/** Width of `text` in em (at font size 1), bold, in the map font. */
export function emWidth(text: string): number {
  const hit = widths.get(text);
  if (hit !== undefined) return hit;
  if (ctx === undefined) {
    try {
      ctx = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null;
      if (ctx) ctx.font = FONT; // set once: resolving a font list is slow in Safari
    } catch {
      ctx = null;
    }
  }
  let w = text.length * CHAR_W;
  if (ctx) {
    const m = ctx.measureText(text).width / 100;
    if (m > 0) w = m;
  }
  if (widths.size > 5000) widths.clear();
  widths.set(text, w);
  return w;
}

export interface FittedLabel {
  lines: string[];
  size: number;
}

/** Where a label breaks: at the last space, else between letters and digits ("B16" → "B", "16"). */
export function splitLabel(text: string): [string, string] | null {
  const t = text.trim();
  const sp = t.lastIndexOf(' ');
  if (sp > 0) return [t.slice(0, sp).trim(), t.slice(sp + 1).trim()];
  const m = /^(.*?[A-Za-z])(\d.*)$/.exec(t) ?? /^(.*?\d)([A-Za-z].*)$/.exec(t);
  if (m && m[1] && m[2]) return [m[1], m[2]];
  return null;
}

export function fitLabel(text: string, maxSize: number, availW: number, availH: number): FittedLabel {
  const t = text.trim();
  const roomW = availW * FILL_W;
  const roomH = availH * FILL_H;
  const one = Math.min(maxSize, roomW / Math.max(CHAR_W, emWidth(t)), roomH / LINE_H);
  let best: FittedLabel = { lines: [t], size: one };
  const split = splitLabel(t);
  if (split && one < maxSize) {
    const longest = Math.max(emWidth(split[0]), emWidth(split[1]), CHAR_W);
    const two = Math.min(maxSize, roomW / longest, roomH / (2 * LINE_H));
    if (two > one * 1.15) best = { lines: split, size: two };
  }
  best.size = Math.max(MIN_SIZE, best.size);
  return best;
}

export const LABEL_LINE_HEIGHT = LINE_H;
