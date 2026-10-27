import { defineConfig } from 'oxfmt';

export default defineConfig({
  singleQuote: true,
  semi: true,
  trailingComma: 'all',
  printWidth: 80,
  sortPackageJson: true,
  ignorePatterns: [
    'pnpm-lock.yaml',
    'packages/web/src/routeTree.gen.ts',
    'dist',
    'node_modules',
    '.tanstack',
  ],
});
