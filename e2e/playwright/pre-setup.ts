/**
 * Pre-setup for bridge-nextjs E2E tests.
 * Creates/gets the test app and writes NEXT_PUBLIC_BRIDGE_APP_ID into demo/.env.test.local.
 */

import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

const rootDir = path.resolve(__dirname, '../..');
dotenv.config({
  path: path.resolve(rootDir, 'config/.env.test.local'),
  override: false,
});

const DEMO_PORT = 3001;
const APP_URL = `http://localhost:${DEMO_PORT}`;

async function preSetup() {
  const mode = process.argv[2] || 'test.local';
  const envFileName =
    mode === 'test.stage' ? '.env.test.stage' : mode === 'test.prod' ? '.env.test.prod' : '.env.test.local';
  const envFile = path.resolve(rootDir, 'demo', envFileName);

  console.log('[pre-setup] Mode:', mode);
  console.log('[pre-setup] Demo env file:', envFile);

  if (!process.env.PLAYWRIGHT_TEST_API_KEY) {
    throw new Error(
      'PLAYWRIGHT_TEST_API_KEY is not set. Copy config/.env.test.local.example to config/.env.test.local and fill in the values.'
    );
  }

  let testDataApiUrl: string;
  if (mode.includes('prod')) {
    testDataApiUrl = process.env.PROD_TEST_DATA_API_URL || '';
    if (!testDataApiUrl) throw new Error('PROD_TEST_DATA_API_URL required for prod');
  } else if (mode.includes('stage')) {
    testDataApiUrl = process.env.STAGE_TEST_DATA_API_URL || '';
    if (!testDataApiUrl) throw new Error('STAGE_TEST_DATA_API_URL required for stage');
  } else {
    testDataApiUrl = process.env.LOCAL_TEST_DATA_API_URL || 'http://localhost:3200';
  }

  const apiKey = process.env.PLAYWRIGHT_TEST_API_KEY;
  const testAppDomain = process.env.APP_DOMAIN || 'BRIDGE_NEXTJS_TEST_DASHBOARD';
  const testAppName = process.env.TEST_APP_NAME || 'Bridge Next.js Test Dashboard';
  const ownerEmail = process.env.TEST_OWNER_EMAIL || 'playwright-e2e@thebridge.io';
  const ownerPassword = process.env.TEST_OWNER_PASSWORD || 'helloworld';

  let healthRes: Response;
  try {
    healthRes = await fetch(`${testDataApiUrl}/account/test/playwright/health`, {
      method: 'GET',
      headers: { 'x-playwright-api-key': apiKey },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const cause = err instanceof Error && err.cause ? ` (${String((err.cause as Error).message)})` : '';
    throw new Error(
      `Test data API health check failed: ${msg}${cause}. URL: ${testDataApiUrl}/account/test/playwright/health`
    );
  }
  if (!healthRes.ok) {
    throw new Error(`Test data API health check failed (${healthRes.status}). Is bridge-api running?`);
  }

  console.log('[pre-setup] Setting up test app...');
  const setupRes = await fetch(`${testDataApiUrl}/account/test/playwright/setup-test-app`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-playwright-api-key': apiKey,
    },
    body: JSON.stringify({
      domain: testAppDomain,
      appName: testAppName,
      ownerEmail,
      ownerPassword,
      appUrl: APP_URL,
    }),
  });

  if (!setupRes.ok) {
    const error = await setupRes.text();
    throw new Error(`Failed to setup test app: ${setupRes.status} ${error}`);
  }

  const result = await setupRes.json();
  const appId = result.appId;

  console.log('[pre-setup] Test app ready, App ID:', appId);

  const demoDir = path.resolve(rootDir, 'demo');
  if (!fs.existsSync(demoDir)) {
    throw new Error(`Demo directory not found: ${demoDir}`);
  }

  let authBaseUrl = '';
  const callbackUrl = `${APP_URL}/auth/oauth-callback`;
  if (mode === 'test.local') {
    authBaseUrl = process.env.LOCAL_AUTH_BASE_URL || `${testDataApiUrl.replace(/\/$/, '')}/auth`;
  } else if (mode === 'test.stage' && process.env.STAGE_AUTH_BASE_URL) {
    authBaseUrl = process.env.STAGE_AUTH_BASE_URL;
  }

  let envContent: string;
  if (fs.existsSync(envFile)) {
    envContent = fs.readFileSync(envFile, 'utf-8');
    envContent = envContent.replace(/^NEXT_PUBLIC_BRIDGE_APP_ID=.*$/m, `NEXT_PUBLIC_BRIDGE_APP_ID=${appId}`);
    if (authBaseUrl) {
      if (/^NEXT_PUBLIC_BRIDGE_AUTH_BASE_URL=/m.test(envContent)) {
        envContent = envContent.replace(
          /^NEXT_PUBLIC_BRIDGE_AUTH_BASE_URL=.*$/m,
          `NEXT_PUBLIC_BRIDGE_AUTH_BASE_URL=${authBaseUrl}`
        );
      } else {
        envContent += `\nNEXT_PUBLIC_BRIDGE_AUTH_BASE_URL=${authBaseUrl}`;
      }
    }
    if (callbackUrl) {
      if (/^NEXT_PUBLIC_BRIDGE_CALLBACK_URL=/m.test(envContent)) {
        envContent = envContent.replace(
          /^NEXT_PUBLIC_BRIDGE_CALLBACK_URL=.*$/m,
          `NEXT_PUBLIC_BRIDGE_CALLBACK_URL=${callbackUrl}`
        );
      } else {
        envContent += `\nNEXT_PUBLIC_BRIDGE_CALLBACK_URL=${callbackUrl}`;
      }
    }
  } else {
    envContent = `# E2E test env — written by pre-setup\nNEXT_PUBLIC_BRIDGE_APP_ID=${appId}\n`;
    if (authBaseUrl) envContent += `NEXT_PUBLIC_BRIDGE_AUTH_BASE_URL=${authBaseUrl}\n`;
    envContent += `NEXT_PUBLIC_BRIDGE_CALLBACK_URL=${callbackUrl}\n`;
  }

  fs.writeFileSync(envFile, envContent);
  const authNote = authBaseUrl ? `, auth + callback for ${mode}` : '';
  console.log('[pre-setup] Updated', envFile, 'with NEXT_PUBLIC_BRIDGE_APP_ID' + authNote);
  console.log('[pre-setup] Done.\n');
}

preSetup().catch((err) => {
  console.error('[pre-setup] Fatal:', err.message);
  process.exit(1);
});
