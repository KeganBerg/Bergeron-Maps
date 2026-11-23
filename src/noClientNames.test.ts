import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * No client or private site names may appear anywhere in the repo (app, site,
 * docs, tests, assets). The blocked words are stored only as SHA-256 hashes so
 * this guard does not itself name anyone. To block another name, add the hash
 * of its lowercase form with spaces, dashes and underscores removed.
 */
const BLOCKED = new Set([
  '61f3aef5104fbe6504a769e3aadb8c0b0b19bc9796ba713189197af5f78363d5',
  '86ba2141e40c402bdac289afe12216e67b1951e253848dd8acaeacf96bd4723a',
  '05d1e78e7dad49fca309007203f29bd5c030a1919b5ef12b523da93fd8673cbe',
]);
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

/** Words, plus each pair of neighbouring words joined, so "Two Words" and "two-words" both match. */
export function blockedWords(text: string): string[] {
  const words = text.toLowerCase().match(/[a-z]+/g) ?? [];
  const hits: string[] = [];
  words.forEach((w, i) => {
    if (BLOCKED.has(sha(w))) hits.push(w);
    const pair = w + (words[i + 1] ?? '');
    if (i + 1 < words.length && BLOCKED.has(sha(pair))) hits.push(pair);
  });
  return hits;
}

const tracked = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);

describe('no client names', () => {
  it('finds a blocked word in a sample', () => {
    // Built from pieces so the plain name is never written in the repo.
    expect(blockedWords(['To', 'wne', ' Pa', 'rk'].join(''))).not.toHaveLength(0);
  });
  it('no tracked file or file path contains a blocked name', () => {
    const found: string[] = [];
    for (const f of tracked) {
      if (blockedWords(f).length) found.push(f);
      if (f === 'package-lock.json') continue; // integrity hashes only
      let text: string;
      try { text = readFileSync(f, 'latin1'); } catch { continue; }
      if (blockedWords(text).length) found.push(f);
    }
    expect(found).toEqual([]);
  });
});
