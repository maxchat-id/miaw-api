import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['test/integration/**/*.test.ts'],
    // Starts one API server for the whole run and tears it down at the end.
    globalSetup: ['./test/integration/global-setup.ts'],
    // Runs inside each worker, where the global setup's env does not reach.
    setupFiles: ['./test/integration/setup-env.ts'],
    exclude: ['node_modules', 'dist'],
    testTimeout: 120000,
    hookTimeout: 120000,
    teardownTimeout: 30000,
    isolate: false,
    poolOptions: {
      threads: {
        singleThread: true,
      },
    },
    reporter: ['verbose'],
  },
});
