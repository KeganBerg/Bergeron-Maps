import type { LabelLayout } from './types';

/** How far the name and symbol can be scaled from their default size. */
export const LABEL_SCALE_MIN = 0.4;
export const LABEL_SCALE_MAX = 3;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function point(p: unknown): { x: number; y: number } | undefined {
  if (!p || typeof p !== 'object') return undefined;
  const { x, y } = p as { x: unknown; y: unknown };
  return num(x) && num(y) ? { x: clamp(x, 0, 1), y: clamp(y, 0, 1) } : undefined;
}

function scale(v: unknown): number | undefined {
  return num(v) && Math.abs(v - 1) > 0.001 ? clamp(v, LABEL_SCALE_MIN, LABEL_SCALE_MAX) : undefined;
}

/**
 * A label layout with every value checked and clamped (maps can be imported
 * from files, so nothing here is trusted). Defaults are dropped, and an
 * all-default layout comes back as undefined.
 */
export function cleanLabelLayout(l: unknown): LabelLayout | undefined {
  if (!l || typeof l !== 'object') return undefined;
  const src = l as LabelLayout;
  const out: LabelLayout = {};
  const t = point(src.text);
  const s = point(src.symbol);
  const ts = scale(src.textScale);
  const ss = scale(src.symbolScale);
  if (t) out.text = t;
  if (s) out.symbol = s;
  if (ts !== undefined) out.textScale = ts;
  if (ss !== undefined) out.symbolScale = ss;
  return Object.keys(out).length ? out : undefined;
}

/** The layout with `patch` applied, cleaned (undefined when everything is back to default). */
export function patchLabelLayout(cur: LabelLayout | undefined, patch: Partial<LabelLayout>): LabelLayout | undefined {
  return cleanLabelLayout({ ...(cur ?? {}), ...patch });
}
