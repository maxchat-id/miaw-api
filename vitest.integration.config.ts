import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['test/integration/**/*.test.ts'],
    // Must run before the test module graph so src/config sees the test env.
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
