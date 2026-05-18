/**
 * Pre-setup for bridge-nextjs E2E tests.
 *
 * Responsibilities:
 *   1. Prereq check — port :3010 must be free; bridge-api must respond on
 *      `${testDataApiUrl}/account/test/playwright/health`.
 *   2. Create/fetch the test app via bridge-api's playwright endpoint.
 *   3. Overwrite `demo/.env.test.{local|stage|prod}` with a fresh appId,
 *      callback URL, and apiBaseUrl (auth-core appends `/auth`, `/cloud-views`
 *      itself — never write the legacy `*_AUTH_BASE_URL` here).
 *
 * Fails fast with a clear message if prereqs aren't met.
 */

import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as net from 'net';
import * as path from 'path';

const rootDir = path.resolve(__dirname, '../..');
dotenv.config({
  path: path.resolve(rootDir, 'config/.env.test.local'),
  override: false,
});

// Test-harness port. Must match `playwright.config.ts` webServer + baseURL.
// :3000 is reserved for `npm run dev` (developer-facing demo).
// :3001 is bridge-svelte's test harness. :3010 is bridge-nextjs's.
// See `.claude/commands/bridge-port.md §7.1` for the per-plugin port table.
const DEMO_PORT = 3010;
const APP_URL = `http://localhost:${DEMO_PORT}`;

/** Prereq check: returns whether a TCP port is free on localhost. */
function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, '127.0.0.1');
  });
}

async function preSetup() {
  // ── Prereq: test-harness port must be free ──────────────────────────────
  // Playwright will spawn `next dev -p ${DEMO_PORT}`. If something else owns
  // the port, the suite hangs or silently hits the wrong server. Fail loud.
  const portFree = await isPortFree(DEMO_PORT);
  if (!portFree) {
    throw new Error(
      `Port :${DEMO_PORT} is already in use. The bridge-nextjs E2E harness needs ` +
        `that port for the auto-started demo. Free it via:\n` +
        `  lsof -nP -iTCP:${DEMO_PORT} -sTCP:LISTEN  →  kill <pid>`
    );
  }

  const mode = process.argv[2] || 'test.local';
  // All env files live in `config/`. Demo runtime for tests is one of:
  //   - `.env.demo.test.local`  (test.local)
  //   - `.env.demo.test.stage`  (test.stage)
  //   - `.env.demo.test.prod`   (test.prod)
  // The playwright webServer command injects the matching file via dotenv-cli
  // before `next dev` runs, so the demo never reads from `demo/.env.*`.
  const envFileName =
    mode === 'test.stage'
      ? '.env.demo.test.stage'
      : mode === 'test.prod'
      ? '.env.demo.test.prod'
      : '.env.demo.test.local';
  const envFile = path.resolve(rootDir, 'config', envFileName);

  console.log('[pre-setup] Mode:', mode);
  console.log('[pre-setup] Demo runtime env file:', envFile);

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
  const ownerEmail = process.env.TEST_OWNER_EMAIL || 'playwright-e2e@example.com';
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

  // In local-dev mode, ensure the dedicated "Bridge Plugin Demos" workspace exists in
  // NBLOCKS_DASHBOARD and link the new test app to it. That puts demo apps in their own
  // workspace in the admin UI at localhost:3023, separate from the developer's main work.
  // CI / stage / prod don't auto-run this — for those, use the standalone setup script in
  // bridge-api/scripts/setup-sdk-demos-workspace.sh (see bridge-api README).
  let adminTenantId: string | undefined;
  if (mode === 'test.local') {
    try {
      const tenantRes = await fetch(
        `${testDataApiUrl}/account/test/playwright/sdk-demos-workspace`,
        { method: 'GET', headers: { 'x-playwright-api-key': apiKey } },
      );
      if (tenantRes.ok) {
        const { tenantId, name } = await tenantRes.json();
        if (tenantId) {
          adminTenantId = tenantId;
          console.log(`[pre-setup] Will link test app to "${name}" workspace (${tenantId})`);
        } else {
          console.log('[pre-setup] SDK demos workspace not available — app will not appear in admin UI.');
        }
      } else if (tenantRes.status === 404) {
        // bridge-api running an older build without the endpoint — older behaviour
        console.log('[pre-setup] sdk-demos-workspace endpoint not available — skipping admin UI link.');
      } else {
        console.log(`[pre-setup] sdk-demos-workspace lookup returned ${tenantRes.status} — skipping admin UI link.`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`[pre-setup] sdk-demos-workspace lookup failed (${msg}) — skipping admin UI link.`);
    }
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
      ...(adminTenantId ? { adminTenantId } : {}),
    }),
  });

  if (!setupRes.ok) {
    const error = await setupRes.text();
    throw new Error(`Failed to setup test app: ${setupRes.status} ${error}`);
  }

  const result = await setupRes.json();
  const appId = result.appId;

  console.log('[pre-setup] Test app ready, App ID:', appId);

  const configDir = path.resolve(rootDir, 'config');
  if (!fs.existsSync(configDir)) {
    throw new Error(`Config directory not found: ${configDir}`);
  }

  const callbackUrl = `${APP_URL}/auth/oauth-callback`;

  // Resolve `apiBaseUrl` (the auth-core root — auth-core appends its own
  // /auth, /cloud-views, etc. paths). Mirrors bridge-svelte's
  // VITE_BRIDGE_API_BASE_URL approach. We never write the legacy
  // NEXT_PUBLIC_BRIDGE_AUTH_BASE_URL — auth-core derives that internally.
  let apiBaseUrl = '';
  if (mode === 'test.local') {
    apiBaseUrl = (process.env.LOCAL_API_BASE_URL || testDataApiUrl).replace(/\/$/, '');
  } else if (mode === 'test.stage' && process.env.STAGE_API_BASE_URL) {
    apiBaseUrl = process.env.STAGE_API_BASE_URL.replace(/\/$/, '');
  } else if (mode === 'test.prod' && process.env.PROD_API_BASE_URL) {
    apiBaseUrl = process.env.PROD_API_BASE_URL.replace(/\/$/, '');
  }

  // pre-setup owns this file — rewrite from scratch every run so we don't
  // accumulate stale legacy env vars (e.g. NEXT_PUBLIC_BRIDGE_AUTH_BASE_URL
  // from a previous schema).
  const lines = [
    '# E2E test env — written by pre-setup. Do not edit by hand.',
    `NEXT_PUBLIC_BRIDGE_APP_ID=${appId}`,
    apiBaseUrl ? `NEXT_PUBLIC_BRIDGE_API_BASE_URL=${apiBaseUrl}` : null,
    `NEXT_PUBLIC_BRIDGE_CALLBACK_URL=${callbackUrl}`,
    'NEXT_PUBLIC_BRIDGE_DEBUG=true',
  ].filter(Boolean);
  fs.writeFileSync(envFile, lines.join('\n') + '\n');

  console.log(
    `[pre-setup] Wrote ${envFile}: appId=${appId}, apiBaseUrl=${apiBaseUrl || '(unset)'}, callback=${callbackUrl}`
  );
  console.log('[pre-setup] Done.\n');
}

preSetup().catch((err) => {
  console.error('[pre-setup] Fatal:', err.message);
  process.exit(1);
});
