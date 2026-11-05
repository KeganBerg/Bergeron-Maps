/// <reference types="vitest" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

/**
 * Google's Material Symbols (Apache 2.0) as one lazily loaded module:
 * `import('virtual:material-symbols')` gives { name: svgPathData } in the
 * 960-unit box the files use (viewBox "0 -960 960 960"). Filled versions are
 * used where they exist because they read better at map-badge size.
 */
function materialSymbols(): Plugin {
  const id = 'virtual:material-symbols';
  return {
    name: 'bm-material-symbols',
    resolveId: (s) => (s === id ? '\0' + id : undefined),
    load(s) {
      if (s !== '\0' + id) return;
      const req = createRequire(import.meta.url);
      const dir = join(dirname(req.resolve('@material-symbols/svg-400/package.json')), 'outlined');
      const out: Record<string, string> = {};
      for (const f of readdirSync(dir).sort()) {
        if (!f.endsWith('.svg') || f.endsWith('-fill.svg')) continue;
        const name = f.slice(0, -4);
        const file = existsSync(join(dir, `${name}-fill.svg`)) ? `${name}-fill.svg` : f;
        const svg = readFileSync(join(dir, file), 'utf8');
        out[name] = [...svg.matchAll(/ d="([^"]+)"/g)].map((m) => m[1]).join('');
      }
      return `export default ${JSON.stringify(out)};`;
    },
  };
}

/**
 * Security headers for the built app. GitHub Pages can't send response headers,
 * so the content security policy goes in a <meta> tag. Build only: the dev
 * server injects inline scripts (React refresh) that this policy would block.
 * The app talks only to itself and to Supabase; map images are data: URLs.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  'upgrade-insecure-requests',
].join('; ');

function securityMeta(): Plugin {
  return {
    name: 'bm-security-meta',
    apply: 'build',
    transformIndexHtml: () => [
      { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP }, injectTo: 'head-prepend' },
      { tag: 'meta', attrs: { name: 'referrer', content: 'strict-origin-when-cross-origin' }, injectTo: 'head' },
    ],
  };
}

export default defineConfig({
  plugins: [react(), securityMeta(), materialSymbols()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    setupFiles: ['src/test-setup.ts'],
  },
});
