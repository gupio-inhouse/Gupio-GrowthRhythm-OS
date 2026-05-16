import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  timeout: 45_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    headless: true,
    channel: 'chrome',
  },
  globalSetup: './tests/e2e/global-setup.ts',
  globalTeardown: './tests/e2e/global-teardown.ts',
  webServer: [
    {
      command: 'cd ../backend && HOST=127.0.0.1 NODE_ENV=test node --import tsx src/index.ts',
      url: 'http://127.0.0.1:4000/health',
      timeout: 60_000,
      reuseExistingServer: true,
    },
    {
      command: 'npm run build && npm run preview -- --host 127.0.0.1 --port 5173',
      url: 'http://127.0.0.1:5173/login',
      timeout: 120_000,
      reuseExistingServer: true,
    },
  ],
  projects: [
    {
      name: 'chrome',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
