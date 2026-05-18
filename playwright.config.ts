import { defineConfig, devices } from '@playwright/test';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({
  path: path.resolve(__dirname, 'config/.env.test.local'),
  override: false,
});

export default defineConfig({
  testDir: './e2e/playwright/tests',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['html', { outputFolder: 'test-reports/playwright-report' }],
    ['json', { outputFile: 'test-reports/playwright-results.json' }],
    ['list'],
  ],
  use: {
    // Hard-coded :3010 so `npm run test:e2e` runs without any env override.
    // :3000 is reserved for `next dev` (developer-facing demo start), :3001 is
    // bridge-svelte's test harness. :3010 keeps the bridge-nextjs test harness
    // isolated from both. LOCAL_BASE_URL is still respected as an escape hatch.
    baseURL: process.env.LOCAL_BASE_URL || 'http://localhost:3010',
    trace: process.env.PLAYWRIGHT_RECORD_ALL === 'true' ? 'on' : 'retain-on-failure',
    screenshot: process.env.PLAYWRIGHT_RECORD_ALL === 'true' ? 'on' : 'only-on-failure',
    headless: process.env.PLAYWRIGHT_HEADED !== 'true',
  },
  projects: [
    { name: 'local', use: { ...devices['Desktop Chrome'] } },
    { name: 'local-no-auth', use: { ...devices['Desktop Chrome'] } },
    { name: 'stage', use: { ...devices['Desktop Chrome'] } },
    { name: 'prod', use: { ...devices['Desktop Chrome'] } },
  ],
  outputDir: 'test-reports/test-results',
  webServer: {
    // All env files live in `bridge-nextjs/config/` (see `.gitignore`).
    // `config/.env.demo.test.local` is auto-written by `pre-setup.ts` with the
    // fresh test appId + apiBaseUrl + callback. `dotenv-cli` injects it into
    // process.env before `next dev` runs, so the demo never depends on any
    // file in its own directory — keeping the developer's `config/.env.local`
    // (their own appId for `npm run dev`) cleanly separated from test runs.
    command: `cd demo && dotenv -e ../config/.env.demo.test.local -- next dev -p 3010`,
    url: 'http://localhost:3010',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  globalSetup: require.resolve('./e2e/playwright/global-setup'),
});
