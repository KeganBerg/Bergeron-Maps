// ESLint: catches real mistakes (unused code, unsafe types, broken React hook rules).
// Formatting is Prettier's job, not ESLint's.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist', '_site', 'node_modules', 'site/vendor', 'site/styles.css', 'playwright-report', 'test-results', 'scripts/tutorials/out'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
    },
  },
  // TypeScript already checks names; plain JS files get the globals of where they run.
  { files: ['**/*.{ts,tsx}'], rules: { 'no-undef': 'off' } },
  // Scripts run in Node and pass functions into a browser page (Playwright), so they get both.
  { files: ['scripts/**/*.{js,mjs}', '*.js'], languageOptions: { globals: { ...globals.node, ...globals.browser } } },
  // The Cloudflare Worker runs in a service-worker-like runtime (fetch, Request, Response, URL).
  { files: ['worker/**/*.js'], languageOptions: { globals: globals.serviceworker } },
  { files: ['site/**/*.js'], languageOptions: { globals: { ...globals.browser, gsap: 'readonly' } } },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/ban-ts-comment': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // `ok ? a() : b()` and `ok && a()` as statements are used on purpose in a few places.
      '@typescript-eslint/no-unused-expressions': ['error', { allowTernary: true, allowShortCircuit: true }],
    },
  },
  // Tests feed deliberately broken data in, which is easiest to write loosely typed.
  { files: ['**/*.test.{ts,tsx}', 'e2e/**/*.ts'], rules: { '@typescript-eslint/no-explicit-any': 'off' } },
);
