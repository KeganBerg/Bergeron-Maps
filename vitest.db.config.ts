import { defineConfig } from 'vitest/config';

// Database (row-level security) tests. Needs DATABASE_URL pointing at a
// Postgres server where the test user may create databases.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['supabase/tests/**/*.test.ts'],
    // One file at a time: the shim creates cluster-wide roles (anon, authenticated),
    // and two files doing that at once on a fresh server collide.
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 30000,
  },
});
