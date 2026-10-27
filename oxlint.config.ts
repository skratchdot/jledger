import { defineConfig } from 'oxlint';

export default defineConfig({
  categories: {
    correctness: 'error',
  },
  ignorePatterns: [
    '**/dist/**',
    '**/.tanstack/**',
    'packages/web/src/routeTree.gen.ts',
  ],
});
