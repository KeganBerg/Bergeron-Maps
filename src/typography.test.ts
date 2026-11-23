import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Guards docs/TYPOGRAPHY.md: one family, three weights, no mono or letter-spaced uppercase labels. */
const read = (p: string) => readFileSync(p, 'utf8');
const walk = (dir: string, ext: RegExp): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (n === 'node_modules' || n === 'vendor') return [];
    return statSync(p).isDirectory() ? walk(p, ext) : ext.test(n) ? [p] : [];
  });

const OTHER_FAMILIES = /Archivo|Barlow|Plex|\bInter\b|Roboto Mono|JetBrains|Space Grotesk|Poppins|monospace|ui-monospace/;
/** Rules where tracking and uppercase are allowed: codes people type. */
const CODE_RULE = /\.(code-input|code-chip|am-code)\b/;

const lines = (css: string) => css.split('\n').map((l, i) => ({ l, n: i + 1 }));

describe('typography rule', () => {
  const appCss = read('src/styles.css');
  const siteCss = read('site/src/input.css');

  it('uses one family (Overpass) in the app, the site and the source', () => {
    for (const [name, text] of [['src/styles.css', appCss], ['site/src/input.css', siteCss]] as const) {
      expect(text, name).not.toMatch(OTHER_FAMILIES);
    }
    for (const f of walk('src', /\.(ts|tsx)$/).filter((f) => !f.endsWith('.test.ts'))) {
      expect(read(f), f).not.toMatch(/Archivo|Barlow|Plex|\bInter\b|monospace/);
    }
    for (const l of appCss.match(/font-family:[^;]*/g) ?? []) expect(l).toMatch(/var\(--font\)|'BM Dot'|inherit/);
  });

  it('uses only weights 400, 600 and 700', () => {
    for (const [name, text] of [['app', appCss], ['site', siteCss]] as const) {
      for (const m of text.matchAll(/font-weight:\s*([^;}]+)/g)) {
        expect(m[1].trim(), name).toMatch(/^(var\(--fw-(regular|semibold|bold)\)|400|600|700|inherit|normal|bold)$/);
      }
      for (const m of text.matchAll(/\bfont:\s*(\d+)/g)) expect(['400', '600', '700'], name).toContain(m[1]);
    }
  });

  it('sizes app text with the --fs tokens', () => {
    for (const { l, n } of lines(appCss)) {
      if (/^\s*--fs-/.test(l)) continue;
      expect(l, `src/styles.css:${n}`).not.toMatch(/font-size:\s*\d+(\.\d+)?px/);
    }
  });

  it('keeps themes to colour only', () => {
    for (const { l, n } of lines(appCss).filter(({ l }) => l.startsWith(':root[data-theme='))) {
      expect(l, `src/styles.css:${n}`).not.toMatch(/font-(size|weight|family)|letter-spacing|text-transform/);
    }
  });

  it('has no letter-spaced uppercase labels outside codes', () => {
    for (const [name, text] of [['src/styles.css', appCss], ['site/src/input.css', siteCss]] as const) {
      for (const { l, n } of lines(text)) {
        if (CODE_RULE.test(l)) continue;
        expect(l, `${name}:${n}`).not.toMatch(/text-transform:\s*uppercase/);
        expect(l, `${name}:${n}`).not.toMatch(/letter-spacing:\s*\.?\d*\.?\d*[1-9]\d*em/);
        expect(l, `${name}:${n}`).not.toMatch(/font-mono|--font-mono|--font-sign|uppercase tracking/);
      }
    }
    const pages = [...walk('site', /\.html$/), 'scripts/site-pages.mjs'];
    for (const f of pages) {
      const t = read(f);
      expect(t, f).not.toMatch(/\bfont-mono\b|\bfont-sign\b|class="[^"]*\buppercase\b|tracking-\[0\.\d+em\]|font-\[(?!400\]|600\]|700\])\d+\]/);
    }
  });
});
