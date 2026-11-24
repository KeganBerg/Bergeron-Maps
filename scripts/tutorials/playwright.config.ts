import { defineConfig, devices } from '@playwright/test';

/** Records the tutorial videos (see README.md here). Not part of the test suite. */
export default defineConfig({
  testDir: '.',
  testMatch: /\.rec\.ts$/,
  timeout: 900_000,
  workers: 1,
  reporter: 'list',
  use: { ...devices['Desktop Chrome'], actionTimeout: 20_000, screenshot: 'only-on-failure' },
});
