import type { RowSpec } from './types';

export type NumberingSpec = Pick<RowSpec, 'start' | 'prefix' | 'suffix' | 'digits'>;

/** Identifier for the i-th space (0-based) of a numbering spec, e.g. B01, B02. */
export function formatIdentifier(spec: NumberingSpec, i: number): string {
  const n = spec.start + i;
  const sign = n < 0 ? '-' : '';
  const body = String(Math.abs(n)).padStart(Math.max(1, spec.digits), '0');
  return `${spec.prefix}${sign}${body}${spec.suffix}`;
}

export function rowLabels(spec: Pick<RowSpec, 'start' | 'prefix' | 'suffix' | 'digits' | 'count' | 'reverse'>): string[] {
  const labels = Array.from({ length: spec.count }, (_, i) => formatIdentifier(spec, i));
  return spec.reverse ? labels.reverse() : labels;
}

export interface ParsedIdentifier {
  prefix: string;
  number: number;
  digits: number;
  suffix: string;
}

/**
 * Splits "B016" into prefix "B", number 16, digits 3. Uses the LAST run of
 * digits so "L2-A14" parses as prefix "L2-A", number 14. Returns null when
 * the identifier has no number at all (e.g. "VIP").
 */
export function parseIdentifier(label: string): ParsedIdentifier | null {
  const m = /^(.*?)(\d+)(\D*)$/.exec(label);
  if (!m) return null;
  return { prefix: m[1], number: parseInt(m[2], 10), digits: m[2].length, suffix: m[3] };
}

/** Highest number already used with this prefix/suffix, or null. */
export function highestNumber(labels: Iterable<string>, prefix: string, suffix = ''): number | null {
  let best: number | null = null;
  for (const l of labels) {
    const p = parseIdentifier(l);
    if (p && p.prefix === prefix && p.suffix === suffix && (best === null || p.number > best)) best = p.number;
  }
  return best;
}

/**
 * Gives each label in `labels` a fresh sequential identifier that does not
 * collide with `existing`. Prefix, suffix and padding of each label are kept;
 * numbering continues after the highest number already in use for that prefix.
 */
export function renumberSequential(labels: string[], existing: Iterable<string>): string[] {
  const used = new Set(existing);
  const next = new Map<string, number>();
  return labels.map((label) => {
    const p = parseIdentifier(label) ?? { prefix: label ? `${label}-` : '', number: 0, digits: 1, suffix: '' };
    const key = `${p.prefix}\u0000${p.suffix}`;
    let n = next.get(key) ?? (highestNumber(used, p.prefix, p.suffix) ?? 0) + 1;
    let candidate = formatIdentifier({ prefix: p.prefix, suffix: p.suffix, digits: p.digits, start: n }, 0);
    while (used.has(candidate)) {
      n++;
      candidate = formatIdentifier({ prefix: p.prefix, suffix: p.suffix, digits: p.digits, start: n }, 0);
    }
    next.set(key, n + 1);
    used.add(candidate);
    return candidate;
  });
}

/** Infers numbering settings from an existing row's first identifier. */
export function specFromLabel(label: string): NumberingSpec {
  const p = parseIdentifier(label);
  if (!p) return { prefix: label, suffix: '', digits: 1, start: 1 };
  return { prefix: p.prefix, suffix: p.suffix, digits: p.digits, start: p.number };
}
