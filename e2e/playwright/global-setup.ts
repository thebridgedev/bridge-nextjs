/**
 * Global setup for bridge-nextjs Playwright E2E tests.
 * Runs once before all tests. Pre-setup has already created the test app and written app ID to demo env.
 */

import { createTestDataClientFromEnv } from './utils/test-data-client';

async function globalSetup() {
  console.log('\n========================================');
  console.log('  bridge-nextjs E2E Global Setup');
  console.log('========================================\n');

  const requiredVars = ['PLAYWRIGHT_TEST_API_KEY'];
  const missing = requiredVars.filter((v) => !process.env[v]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}. Copy config/.env.test.local.example to config/.env.test.local and fill in the values.`
    );
  }

  const testDataClient = createTestDataClientFromEnv();
  const testAppDomain = process.env.APP_DOMAIN || 'BRIDGE_NEXTJS_TEST_DASHBOARD';
  const testAppName = process.env.TEST_APP_NAME || 'Bridge Next.js Test Dashboard';
  const ownerEmail = process.env.TEST_OWNER_EMAIL || 'playwright-e2e@thebridge.io';
  const ownerPassword = process.env.TEST_OWNER_PASSWORD || 'helloworld';
  const appUrl = process.env.LOCAL_BASE_URL || 'http://localhost:3001';

  try {
    const result = await testDataClient.setupTestApp(
      testAppDomain,
      testAppName,
      ownerEmail,
      ownerPassword,
      appUrl
    );

    process.env.BRIDGE_TEST_APP_ID = result.appId;
    process.env.BRIDGE_TEST_OWNER_EMAIL = result.email;
    process.env.BRIDGE_TEST_OWNER_PASSWORD = ownerPassword;

    console.log('[global-setup] Test app ready:', result.appId);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to fetch test app. Is bridge-api running? Error: ${message}`);
  }

  try {
    const purgedCount = await testDataClient.purgeTestAccounts();
    console.log('[global-setup] Purged', purgedCount, 'stale test account(s)');
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn('[global-setup] Warning: Failed to purge test accounts:', message);
  }

  console.log('\n[global-setup] Setup complete\n');
}

export default globalSetup;
