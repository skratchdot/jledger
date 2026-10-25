import { defineConfig } from '@playwright/test';
const base = process.env.JLEDGER_TEST_BASE_PATH || '/';
export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: true,
  use: {
    baseURL: `http://127.0.0.1:4317${base}`,
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : {},
  },
  webServer: {
    command:
      base === '/'
        ? 'node packages/cli/dist/index.js -f packages/examples/demo.journal server --port 4317'
        : 'node scripts/serve-static.mjs',
    url: `http://127.0.0.1:4317${base}`,
    reuseExistingServer: !process.env.CI,
  },
});
