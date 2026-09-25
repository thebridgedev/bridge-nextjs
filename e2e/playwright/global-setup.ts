/**
 * Global setup for bridge-nextjs Playwright E2E tests.
 *
 * Runs once before all tests (after the demo app is already started).
 *
 * ## App id resolution
 *
 * The app id is resolved HERE, from the test-data API, and seeded straight into
 * the browser context's localStorage (`bridge:appId`), which the demo passes to
 * BridgeProvider (demo/src/components/demo-app-id.ts). The demo env files leave
 * `NEXT_PUBLIC_BRIDGE_APP_ID` empty, so nothing has to be written into them per
 * run and a clean checkout boots (TBP-721, mirrors bridge-svelte TBP-606).
 *
 * ## Environment boundary
 *
 * The demo has to be serving the SAME environment this run targets. It was not:
 * the webServer always booted it with the local env file, so the stage run made
 * its test accounts on stage while the browser logged in against
 * http://localhost:3200 with the local app id. This file now asserts, before any
 * spec runs, that the demo's env pill and API root match the Playwright project
 * AND that the requests the SDK actually makes on boot go to that backend and no
 * other Bridge backend (TBP-721, mirrors bridge-svelte TBP-607).
 *
 * Steps:
 * 1. Validate required environment variables
 * 2. Resolve the app id from the test-data API
 * 3. Seed it into localStorage, load the demo, verify app id + environment
 * 4. Save the storage state to base-state.json for all tests to inherit
 * 5. Purge stale playwright test accounts
 */

import { chromium, type Request } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import {
  DEFAULT_DEMO_BASE_URL,
  DEFAULT_LOCAL_API_BASE_URL,
  DEFAULT_PROD_API_BASE_URL,
  DEFAULT_STAGE_API_BASE_URL,
  expectedDemoApiBaseUrl,
  getCurrentEnvironment,
} from './config/environments';
import { createTestDataClientFromEnv } from './utils/test-data-client';

const APP_ID_STORAGE_KEY = 'bridge:appId';

type StorageState = {
  // Playwright's own cookie shape; opaque here — global-setup never reads it.
  cookies: any[];
  origins: { origin: string; localStorage: { name: string; value: string }[] }[];
};

/** The demo env file backing the current Playwright project, for error messages. */
function demoEnvFile(env: 'local' | 'stage' | 'prod'): string {
  return `config/.env.demo.test.${env}`;
}

/** Storage state that pins `bridge:appId` on the demo origin. */
export function buildAppIdState(appId: string, baseURL: string): StorageState {
  return {
    cookies: [],
    origins: [
      {
        origin: new URL(baseURL).origin,
        localStorage: [{ name: APP_ID_STORAGE_KEY, value: appId }],
      },
    ],
  };
}

/**
 * Every Bridge backend origin the demo could conceivably be pointed at. A boot
 * request to any of these other than the expected one means the demo is talking
 * to the wrong environment.
 */
function knownBridgeOrigins(): string[] {
  return Array.from(
    new Set(
      [
        DEFAULT_PROD_API_BASE_URL,
        'https://auth.thebridge.dev',
        DEFAULT_STAGE_API_BASE_URL,
        'https://auth-stage.thebridge.dev',
        DEFAULT_LOCAL_API_BASE_URL,
        expectedDemoApiBaseUrl('local'),
        expectedDemoApiBaseUrl('stage'),
        expectedDemoApiBaseUrl('prod'),
      ].map((u) => new URL(u).origin),
    ),
  );
}

/**
 * Load the demo with the app id seeded and prove it is wired to the right
 * backend. Throws with an actionable message otherwise.
 */
export async function verifyDemoBoot(opts: {
  baseURL: string;
  appId: string;
}): Promise<void> {
  const env = getCurrentEnvironment();
  const envFile = demoEnvFile(env);
  const expectedApi = expectedDemoApiBaseUrl(env);
  const expectedOrigin = new URL(expectedApi).origin;
  const foreignOrigins = knownBridgeOrigins().filter((o) => o !== expectedOrigin);

  const browser = await chromium.launch();
  const context = await browser.newContext({
    storageState: buildAppIdState(opts.appId, opts.baseURL),
  });
  const page = await context.newPage();

  const bridgeRequests: string[] = [];
  page.on('request', (req: Request) => {
    const origin = (() => {
      try {
        return new URL(req.url()).origin;
      } catch {
        return '';
      }
    })();
    if (origin === expectedOrigin || foreignOrigins.includes(origin)) {
      bridgeRequests.push(req.url());
    }
  });

  try {
    // Don't wait for 'load'/'networkidle': the SDK opens a realtime WebSocket.
    await page.goto(opts.baseURL, { waitUntil: 'domcontentloaded' });

    // ConfigStatus renders the app id only once it resolved one.
    const appIdCode = page.locator('[data-testid="bridge-app-id"]');
    try {
      await appIdCode.waitFor({ timeout: 60_000 });
    } catch (waitError: unknown) {
      const demoMessage = await page
        .locator('.feature-status')
        .first()
        .innerText()
        .catch(() => '');
      throw new Error(
        `The demo at ${opts.baseURL} did not initialize Bridge with app id ${opts.appId}.\n` +
          (demoMessage ? `Demo reported: ${demoMessage.replace(/\s+/g, ' ').trim()}\n` : '') +
          `The app id was seeded into localStorage as "${APP_ID_STORAGE_KEY}"; if the demo ` +
          `ignored it, check NEXT_PUBLIC_BRIDGE_APP_ID in ${envFile} (it must be empty — ` +
          `env wins over the seeded id).\n` +
          `Underlying wait: ${waitError instanceof Error ? waitError.message : String(waitError)}`,
      );
    }

    const shownAppId = (await appIdCode.innerText()).trim();
    if (shownAppId !== opts.appId) {
      throw new Error(
        `The demo at ${opts.baseURL} initialized with app id ${shownAppId}, expected ${opts.appId}.\n` +
          `Something is pinning the app id — NEXT_PUBLIC_BRIDGE_APP_ID in ${envFile} must be empty.`,
      );
    }

    // The environment the demo build was started for, and its API root.
    const pill = page.locator('.env-pill').first();
    const shownEnv = await pill.getAttribute('data-env').catch(() => null);
    const shownApiRaw = (await pill.getAttribute('data-api-base-url').catch(() => null)) ?? '';
    // An empty API root means "SDK default", which is production.
    const shownApi = (shownApiRaw || DEFAULT_PROD_API_BASE_URL).replace(/\/$/, '');

    if (shownEnv !== env || shownApi !== expectedApi) {
      throw new Error(
        `The demo at ${opts.baseURL} is serving environment "${shownEnv ?? 'unknown'}" ` +
          `against ${shownApi}, but this run targets "${env}" (${expectedApi}).\n` +
          `The webServer loads the demo env from ${envFile}. If a demo was already ` +
          `running on that port, Playwright reused it — stop it and re-run:\n` +
          `  lsof -nP -iTCP:${new URL(opts.baseURL).port || '80'} -sTCP:LISTEN  →  kill <pid>`,
      );
    }

    // What the SDK actually calls on boot is the real boundary: wait for it to
    // reach the expected backend, then make sure nothing went anywhere else.
    if (!bridgeRequests.some((u) => u.startsWith(expectedOrigin))) {
      await page
        .waitForRequest((r) => r.url().startsWith(expectedOrigin), { timeout: 30_000 })
        .catch(() => {
          throw new Error(
            `The demo at ${opts.baseURL} made no request to ${expectedOrigin} while booting. ` +
              `Bridge requests seen: ${bridgeRequests.join(', ') || '(none)'}`,
          );
        });
    }
    const strays = bridgeRequests.filter((u) => foreignOrigins.includes(new URL(u).origin));
    if (strays.length > 0) {
      throw new Error(
        `The demo at ${opts.baseURL} (run: "${env}") called another environment's Bridge ` +
          `backend while booting:\n  ${strays.join('\n  ')}\n` +
          `Every key in ${envFile} must be written explicitly — a missing one falls back to ` +
          `the SDK's production default.`,
      );
    }

    console.log(
      `[global-setup] Demo initialized with app id ${opts.appId}, environment "${shownEnv}", API ${shownApi}`,
    );
  } finally {
    await browser.close();
  }
}

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

  const testAppDomain = process.env.APP_DOMAIN || 'BRIDGE_NEXTJS_TEST_DASHBOARD';
  const testDataClient = createTestDataClientFromEnv(testAppDomain);
  const testAppName = process.env.TEST_APP_NAME || 'Bridge Next.js Test Dashboard';
  const ownerEmail = process.env.TEST_OWNER_EMAIL || 'playwright-e2e@example.com';
  const ownerPassword = process.env.TEST_OWNER_PASSWORD || 'helloworld';
  const baseURL = process.env.LOCAL_BASE_URL || DEFAULT_DEMO_BASE_URL;

  let appId: string;
  try {
    const result = await testDataClient.setupTestApp(
      testAppDomain,
      testAppName,
      ownerEmail,
      ownerPassword,
      baseURL
    );
    appId = (result.appId || '').trim();
    if (!appId) throw new Error(`setup-test-app returned an empty appId for ${testAppDomain}`);

    process.env.BRIDGE_TEST_APP_ID = appId;
    process.env.BRIDGE_TEST_OWNER_EMAIL = result.email;
    process.env.BRIDGE_TEST_OWNER_PASSWORD = ownerPassword;

    console.log('[global-setup] Test app ready:', appId);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Could not resolve a Bridge app id for this run (domain ${testAppDomain}). ` +
        `Check STAGE_TEST_DATA_API_URL / PROD_TEST_DATA_API_URL / LOCAL_TEST_DATA_API_URL and ` +
        `PLAYWRIGHT_TEST_API_KEY in config/.env.test.local. Error: ${message}`,
    );
  }

  await verifyDemoBoot({ baseURL, appId });

  // The state every test context starts from: the app id and nothing else (no
  // tokens, no cookies) — see `use.storageState` in playwright.config.ts.
  const authDir = path.resolve(__dirname, '.auth');
  fs.mkdirSync(authDir, { recursive: true });
  const baseStatePath = path.resolve(authDir, 'base-state.json');
  fs.writeFileSync(baseStatePath, JSON.stringify(buildAppIdState(appId, baseURL), null, 2));
  console.log(`[global-setup] Storage state saved to ${baseStatePath}`);

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
