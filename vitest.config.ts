import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    pool: 'threads',
    poolOptions: {
      threads: {
        isolate: true,
        singleThread: true,
      },
    },
    maxConcurrency: 1,
  },
});
