/**
 * Global setup for bridge-nextjs Playwright E2E tests.
 *
 * Runs once before all tests (after the demo app is already started).
 *
 * ## One Bridge app per worker
 *
 * `paymentsAutoRedirect`, `stripeEnabled`, the SSO flags and the plan catalogue
 * live on the **app**, not the tenant. With every worker pointed at one shared
 * app, a spec that wrote one of them wrote it for every other worker too — and
 * welcome-paywall deleted the TEAM plan every test account is created on. So
 * this file provisions one app per Playwright worker — idempotent by domain,
 * reused across runs — ensures the plans the suite needs on each, and writes:
 *
 *   - `.auth/worker-apps.json`       the manifest fixtures resolve their app from
 *   - `.auth/worker-<i>-state.json`  storage state seeding that app's `bridge:appId`
 *
 * Worker 0 keeps the unsuffixed domain, so `--workers=1` targets exactly the app
 * this suite has always used (TBP-721, mirrors bridge-svelte TBP-604).
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
 * 2. Provision one app per worker and ensure the TEAM plan on each
 * 3. Write the manifest + per-worker storage states
 * 4. Load the demo with worker 0's app id, verify app id + environment
 * 5. Warm the reusable paywall plan on each app, and purge stale test accounts
 */

import { chromium, type FullConfig, type Request } from '@playwright/test';
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
import { PAYWALL_PLAN, TEAM_PLAN } from './fixtures/plans';
import {
  BASELINE_APP_CONFIG,
  workerAppDomain,
  workerAppOwnerEmail,
  workerStorageStatePath,
  writeWorkerApps,
  type WorkerApp,
} from './fixtures/worker-app';
import { TestDataClient, createTestDataClientFromEnv } from './utils/test-data-client';

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
    // Don't wait for the load or network-idle states: the SDK opens a realtime WebSocket.
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

/**
 * A test-data client bound to one worker's app domain. Deliberately NOT built
 * from `getEnvironmentConfig()`: that requires `BRIDGE_TEST_APP_ID`, which does
 * not exist yet while this file provisions the apps that define it.
 */
function clientForDomain(appDomain: string): TestDataClient {
  return createTestDataClientFromEnv(appDomain);
}

/**
 * Provision (or re-resolve) one worker's app, put it on the baseline config,
 * make sure it has the TEAM plan, and write its storage state.
 *
 * `setup-test-app` is idempotent by domain: the first run creates the app with
 * its seeded plans and OAuth config, every later run just refreshes that config.
 */
async function provisionWorkerApp(
  parallelIndex: number,
  opts: { baseDomain: string; baseName: string; ownerPassword: string; baseURL: string },
): Promise<WorkerApp> {
  const appDomain = workerAppDomain(opts.baseDomain, parallelIndex);
  // Worker 0 keeps the owner this suite always used. Neither it nor the
  // per-worker owners match bridge-api's purge pattern (`iman+playwright-test-*`),
  // so the suite's own purge can never delete an app owner.
  const ownerEmail =
    parallelIndex === 0
      ? process.env.TEST_OWNER_EMAIL || 'playwright-e2e@example.com'
      : workerAppOwnerEmail(parallelIndex);
  const appName =
    parallelIndex === 0 ? opts.baseName : `${opts.baseName} (worker ${parallelIndex})`;

  const client = clientForDomain(appDomain);
  const result = await client.setupTestApp(
    appDomain,
    appName,
    ownerEmail,
    opts.ownerPassword,
    opts.baseURL,
  );
  const appId = (result.appId || '').trim();
  if (!appId) {
    throw new Error(`setup-test-app returned an empty appId for domain ${appDomain}`);
  }

  // SDK auth from the demo origin.
  await client
    .configureApp({
      allowedOrigins: ['http://localhost:*'],
      redirectUris: [`${new URL(opts.baseURL).origin}/auth/oauth-callback`],
      defaultCallbackUri: `${new URL(opts.baseURL).origin}/auth/oauth-callback`,
    })
    .catch((error: Error) => {
      console.warn(`[global-setup] ${appDomain}: could not widen OAuth config: ${error.message}`);
    });

  // The baseline every test may assume — including after an interrupted run
  // left Stripe, the paywall or SSO switched on. Not best-effort: a worker app
  // stuck off-baseline would fail specs far away from the cause.
  await client.configureApp({ ...BASELINE_APP_CONFIG });

  // Every test account is bound to TEAM (bridge-api hard-codes it), so an app
  // without it cannot run a single authenticated spec. Create-if-absent.
  const team = await client.ensurePlan({ ...TEAM_PLAN });
  if (team.created) {
    console.log(`[global-setup] ${appDomain}: TEAM plan was missing — recreated`);
  }

  const storageStatePath = workerStorageStatePath(parallelIndex);
  fs.mkdirSync(path.dirname(storageStatePath), { recursive: true });
  fs.writeFileSync(storageStatePath, JSON.stringify(buildAppIdState(appId, opts.baseURL), null, 2));

  return { parallelIndex, appId, appDomain, ownerEmail, storageStatePath };
}

/**
 * Create the stable paywall plan (and its Stripe price) on an app ahead of the
 * run, so welcome-paywall never has to create-then-immediately-check-out
 * against a price bridge-api is still syncing. Idempotent: on every run after
 * the first, `ensure-plan` returns the existing plan without re-running the sync.
 */
async function warmPaywallPlan(app: WorkerApp): Promise<void> {
  const pk = process.env.STRIPE_TEST_PK || '';
  const sk = process.env.STRIPE_TEST_SK || '';
  if (!pk || !sk) return; // welcome-paywall skips itself without these

  const client = clientForDomain(app.appDomain);
  try {
    await client.configureApp({
      stripeEnabled: true,
      stripePublicKey: pk,
      stripeSecretKey: sk,
      currency: PAYWALL_PLAN.currency,
    });
    const result = await client.ensurePlan({ ...PAYWALL_PLAN.definition });
    if (result.created) {
      console.log(`[global-setup] ${app.appDomain}: created paywall plan ${PAYWALL_PLAN.key}`);
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      `[global-setup] ${app.appDomain}: paywall plan warm-up failed (${message}) — ` +
        `welcome-paywall will provision it itself.`,
    );
  } finally {
    // Leave the app on the baseline every test is entitled to assume.
    await client.configureApp({ ...BASELINE_APP_CONFIG }).catch(() => {});
  }
}

async function globalSetup(config: FullConfig) {
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

  const baseDomain = process.env.APP_DOMAIN || 'BRIDGE_NEXTJS_TEST_DASHBOARD';
  const baseName = process.env.TEST_APP_NAME || 'Bridge Next.js Test Dashboard';
  const ownerPassword = process.env.TEST_OWNER_PASSWORD || 'helloworld';
  const baseURL = process.env.LOCAL_BASE_URL || DEFAULT_DEMO_BASE_URL;

  // `config.workers` is the resolved count for this run, so `--workers N` sizes
  // the pool automatically.
  const workerCount = Math.max(1, config.workers || 1);
  console.log(
    `[global-setup] Provisioning ${workerCount} worker app(s) from base domain ${baseDomain}...`,
  );

  let workerApps: WorkerApp[];
  try {
    workerApps = await Promise.all(
      Array.from({ length: workerCount }, (_, i) =>
        provisionWorkerApp(i, { baseDomain, baseName, ownerPassword, baseURL }),
      ),
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Could not provision the per-worker Bridge apps for this run (base domain ${baseDomain}). ` +
        `Check STAGE_TEST_DATA_API_URL / PROD_TEST_DATA_API_URL / LOCAL_TEST_DATA_API_URL and ` +
        `PLAYWRIGHT_TEST_API_KEY in config/.env.test.local. Error: ${message}`,
    );
  }

  writeWorkerApps(workerApps);
  for (const app of workerApps) {
    console.log(`[global-setup]   worker ${app.parallelIndex}: ${app.appDomain} → ${app.appId}`);
  }

  // Worker 0's app is the one the demo is verified with below, and the one any
  // code reading BRIDGE_TEST_APP_ID (getEnvironmentConfig's required-var check)
  // falls back to. Worker processes inherit this env.
  const primary = workerApps[0];
  process.env.BRIDGE_TEST_APP_ID = primary.appId;
  process.env.BRIDGE_TEST_OWNER_EMAIL = primary.ownerEmail;
  process.env.BRIDGE_TEST_OWNER_PASSWORD = ownerPassword;

  await verifyDemoBoot({ baseURL, appId: primary.appId });

  // The config-level default state (`use.storageState`), for anything that has
  // not opted into the per-worker fixtures: worker 0's app id and nothing else.
  const baseStatePath = path.resolve(path.dirname(primary.storageStatePath), 'base-state.json');
  fs.writeFileSync(baseStatePath, JSON.stringify(buildAppIdState(primary.appId, baseURL), null, 2));
  console.log(`[global-setup] Storage state saved to ${baseStatePath}`);

  // Serial on purpose: the Stripe price sync behind `ensure-plan` is rate
  // limited per Stripe account (shared with the other plugin suites), and this
  // is a once-per-run cost anyway.
  for (const app of workerApps) {
    await warmPaywallPlan(app);
  }

  await Promise.all(
    workerApps.map(async (app) => {
      try {
        const purgedCount = await clientForDomain(app.appDomain).purgeTestAccounts();
        if (purgedCount > 0) {
          console.log(`[global-setup] ${app.appDomain}: purged ${purgedCount} stale test account(s)`);
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[global-setup] ${app.appDomain}: failed to purge test accounts: ${message}`);
      }
    }),
  );

  console.log('\n[global-setup] Setup complete\n');
}

export default globalSetup;
