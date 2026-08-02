import { defineConfig } from '@playwright/test';

// Editor-functional tests run against the DEV server (the editor only exists in `astro dev`).
export default defineConfig({
  testDir: './tests/editor',
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:4321',
    reuseExistingServer: !process.env.CI,
  },
  use: { baseURL: 'http://localhost:4321' },
});
