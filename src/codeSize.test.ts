import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Keeps files small enough to read in one sitting (rule in CLAUDE.md and
 * docs/ARCHITECTURE.md, "Code size and structure"). App code in src/ may not
 * pass MAX_LINES. Tests and the symbol catalog (long lists of drawings) are
 * exempt.
 *
 * OVER_LIMIT lists files that were already too big when this rule started.
 * They may shrink but not grow; when one is split below the limit, delete
 * its line here. Never add a new file to this list: split it instead.
 */
const MAX_LINES = 600;
const OVER_LIMIT: Record<string, number> = {
  'src/render/MapObjects.tsx': 805,
  'src/editor/store.ts': 1065,
  'src/editor/CanvasStage.tsx': 1079,
  'src/viewer/ViewerPage.tsx': 1138,
};

const exempt = (f: string) => /\.test\.tsx?$/.test(f) || f.startsWith('src/assets/catalog/');

const files = execFileSync('git', ['ls-files', 'src'], { encoding: 'utf8' })
  .split('\n')
  .filter((f) => /\.tsx?$/.test(f) && !exempt(f));

const lines = (f: string) => readFileSync(f, 'utf8').split('\n').length - 1;

describe('code size', () => {
  it(`keeps app files under ${MAX_LINES} lines`, () => {
    const tooBig = files
      .filter((f) => !(f in OVER_LIMIT) && lines(f) > MAX_LINES)
      .map((f) => `${f}: ${lines(f)} lines`);
    expect(tooBig, 'Split these files by job (see docs/ARCHITECTURE.md)').toEqual([]);
  });

  it('does not let the files already over the limit grow', () => {
    const grew = Object.entries(OVER_LIMIT)
      .filter(([f, max]) => files.includes(f) && lines(f) > max)
      .map(([f, max]) => `${f}: ${lines(f)} lines (was ${max})`);
    expect(grew, 'Split these files instead of adding to them').toEqual([]);
  });

  it('forgets files that are now under the limit', () => {
    const done = Object.keys(OVER_LIMIT).filter((f) => !files.includes(f) || lines(f) <= MAX_LINES);
    expect(done, 'Remove these from OVER_LIMIT in src/codeSize.test.ts').toEqual([]);
  });
});
