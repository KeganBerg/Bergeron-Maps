import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * No middle-dot separators ("·") anywhere people read: app, site, emails.
 * Lists use commas, page titles use " | ", and the site's link rows use
 * spacing. See CLAUDE.md.
 */
const walk = (dir: string, ext: RegExp): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    // scripts/tutorials/out holds the built app the tutorial videos record (git ignores it).
    if (n === 'node_modules' || n === 'vendor' || p === 'scripts/tutorials/out') return [];
    return statSync(p).isDirectory() ? walk(p, ext) : ext.test(n) ? [p] : [];
  });

describe('separators', () => {
  const files = [
    ...walk('src', /\.(ts|tsx|css)$/).filter((f) => !/\.test\.tsx?$/.test(f)),
    ...walk('site', /\.(html|js|css)$/),
    ...walk('scripts', /\.(ts|mjs|js)$/),
    ...walk('supabase/email-templates', /\.html$/),
  ];
  it.each(files)('%s has no middle dot', (f) => {
    expect(readFileSync(f, 'utf8')).not.toMatch(/·|&middot;|&#183;|\\u00b7/i);
  });
});
