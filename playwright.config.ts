import { defineConfig, devices } from '@playwright/test';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({
  path: path.resolve(__dirname, 'config/.env.test.local'),
  override: false,
});

function getDemoEnvFile(): string {
  const project = process.env.PLAYWRIGHT_PROJECT_NAME || '';
  if (project.includes('prod')) return '.env.test.prod';
  if (project.includes('stage')) return '.env.test.stage';
  return '.env.test.local';
}

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
    baseURL: process.env.LOCAL_BASE_URL || 'http://localhost:3001',
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
    command: `cd demo && npx dotenv -e ${getDemoEnvFile()} -- npx next dev -p 3001`,
    url: 'http://localhost:3001',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  globalSetup: require.resolve('./e2e/playwright/global-setup'),
});
