import { defineConfig, devices } from '@playwright/test';

/** Specs that drive real mouse, keyboard and wheel input: these also run in WebKit (Safari) and Firefox. */
const REAL_INPUT = /(click-accuracy|action-sequence|workflow|audit-regressions|regressions|editor|interiors)\.spec\.ts/;
// WebKit and Firefox are installed in CI; locally only Chromium may be present.
const ALL_BROWSERS = !!process.env.CI || !!process.env.ALL_BROWSERS;

export default defineConfig({
  testDir: 'e2e',
  testIgnore: /_dbg/,
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:5174',
    viewport: { width: 1400, height: 860 },
    // A video of every failure, kept with the report, so a bug comes with what the user would have seen.
    video: 'retain-on-failure',
  },
  webServer: { command: 'npx vite --port 5174 --strictPort', url: 'http://localhost:5174', reuseExistingServer: true },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1400, height: 860 } }, testIgnore: [/mobile/, /_dbg/] },
    { name: 'desktop-1920', use: { ...devices['Desktop Chrome'], viewport: { width: 1920, height: 1080 } }, testMatch: /(click-accuracy|action-sequence|audit-regressions)\.spec\.ts/ },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /mobile/ },
    ...(ALL_BROWSERS
      ? [
          { name: 'webkit', use: { ...devices['Desktop Safari'], viewport: { width: 1440, height: 900 } }, testMatch: REAL_INPUT },
          { name: 'firefox', use: { ...devices['Desktop Firefox'], viewport: { width: 1440, height: 900 } }, testMatch: REAL_INPUT },
          { name: 'iphone', use: { ...devices['iPhone 14'] }, testMatch: /mobile/ },
        ]
      : []),
  ],
});
