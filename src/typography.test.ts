import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Guards docs/TYPOGRAPHY.md: the device's own UI font, three weights, no mono or letter-spaced uppercase labels. */
const read = (p: string) => readFileSync(p, 'utf8');
const walk = (dir: string, ext: RegExp): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (n === 'node_modules' || n === 'vendor') return [];
    return statSync(p).isDirectory() ? walk(p, ext) : ext.test(n) ? [p] : [];
  });

const OTHER_FAMILIES = /Overpass|Archivo|Barlow|Plex|\bInter\b|Geist|Roboto Mono|JetBrains|Space Grotesk|Poppins|DM Sans|Manrope|monospace|ui-monospace|@font-face|woff2?/;
const STACK = '-apple-system, BlinkMacSystemFont';
/** Rules where tracking and uppercase are allowed: codes people type. */
const CODE_RULE = /\.(code-input|code-chip|am-code)\b/;

const lines = (css: string) => css.split('\n').map((l, i) => ({ l, n: i + 1 }));

describe('typography rule', () => {
  const appCss = read('src/styles.css');
  const siteCss = read('site/src/input.css');

  it('uses the native UI font stack and loads no web fonts', () => {
    expect(appCss).toContain(`--font: ${STACK}`);
    expect(siteCss).toContain(`--font-sans: ${STACK}`);
    expect(read('package.json')).not.toMatch(/@fontsource/);
    for (const [name, text] of [['src/styles.css', appCss], ['site/src/input.css', siteCss]] as const) {
      expect(text, name).not.toMatch(OTHER_FAMILIES);
    }
    for (const f of walk('src', /\.(ts|tsx)$/).filter((f) => !f.endsWith('.test.ts'))) {
      expect(read(f), f).not.toMatch(/@fontsource|Overpass|Archivo|Barlow|Plex|\bInter\b|Geist|monospace/);
    }
    for (const l of appCss.match(/font-family:[^;]*/g) ?? []) expect(l).toMatch(/var\(--font\)|inherit/);
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

  it('gives text room: body line spacing set, nothing cramped below 1.2', () => {
    expect(appCss).toMatch(/body \{[^}]*line-height: var\(--lh-body\)/);
    for (const { l, n } of lines(appCss)) {
      if (/label-handle|inline-label|\.lbl-edit|brand-/.test(l)) continue; // labels on the map, and the logo
      const m = l.match(/line-height:\s*(\d*\.?\d+)\s*[;}]/);
      if (m) expect(Number(m[1]), `src/styles.css:${n}`).toBeGreaterThanOrEqual(1.2);
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
      // Zero-padded index numbers ("01", "02") on cards and steps are the same AI-made tell.
      expect(t, f).not.toMatch(/>\s*0[1-9]\s*<|>0\$\{/);
      expect(t, f).not.toMatch(/\bfont-mono\b|\bfont-sign\b|class="[^"]*\buppercase\b|tracking-\[0\.\d+em\]|font-\[(?!400\]|600\]|700\])\d+\]/);
    }
  });
});
