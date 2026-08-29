import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Scaffolded so the package is test-ready without further setup, per
// plans/15-export-to-ci.plan.md Phase 1. No test files are added by this
// plan (see agent-runner/AGENTS.md) — `npm test` currently passes with
// zero suites (`--passWithNoTests` in package.json).
export default defineConfig({
  resolve: {
    alias: {
      '@devdigest/shared': path.resolve(__dirname, '../server/src/vendor/shared'),
      '@devdigest/reviewer-core': path.resolve(__dirname, '../reviewer-core/src'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts', 'src/**/*.test.ts'],
  },
});
