/**
 * Fits a label into a box: shrink to fit on one line, or break it onto two
 * lines ("F6" over "116") when that lets it stay larger. Character width is
 * estimated from the font size, which is close enough for bold sans labels.
 */
const CHAR_W = 0.62;
const LINE_H = 1.1;
const MIN_SIZE = 6;

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
  const one = Math.min(maxSize, (availW * 0.9) / Math.max(1, t.length * CHAR_W), (availH * 0.9) / LINE_H);
  let best: FittedLabel = { lines: [t], size: one };
  const split = splitLabel(t);
  if (split && one < maxSize) {
    const longest = Math.max(split[0].length, split[1].length);
    const two = Math.min(maxSize, (availW * 0.9) / Math.max(1, longest * CHAR_W), (availH * 0.9) / (2 * LINE_H));
    if (two > one * 1.15) best = { lines: split, size: two };
  }
  best.size = Math.max(MIN_SIZE, best.size);
  return best;
}

export const LABEL_LINE_HEIGHT = LINE_H;
