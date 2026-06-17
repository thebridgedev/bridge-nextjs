/**
 * Auth fixtures for bridge-nextjs Playwright E2E tests.
 */

import { test as base, expect, type Page } from '@playwright/test';
import {
  type EnvironmentConfig,
  getCurrentEnvironment,
  getEnvironmentConfig,
} from '../config/environments';
import { type PlaywrightTestAccount, TestDataClient } from '../utils/test-data-client';
import { LONG_TIMEOUT, MED_TIMEOUT } from './timeouts';

export interface AuthFixtures {
  testUser: PlaywrightTestAccount;
  authenticatedPage: Page;
  envConfig: EnvironmentConfig;
  testDataClient: TestDataClient;
}

export const test = base.extend<AuthFixtures>({
  envConfig: async ({}, use) => {
    const env = getCurrentEnvironment();
    const config = getEnvironmentConfig(env);
    await use(config);
  },

  testDataClient: async ({ envConfig }, use) => {
    const client = new TestDataClient(envConfig);
    await use(client);
  },

  testUser: async ({ testDataClient }, use) => {
    const account = await testDataClient.createTestAccount();
    await use(account);
    try {
      await testDataClient.removeTestAccount(account.email);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[fixture] Failed to remove test account ${account.email}: ${message}`);
    }
  },

  // Uses the in-app SDK auth flow (mirrors bridge-svelte). The hosted-redirect
  // helper `loginViaBridgeAuth` remains exported for tests that need it.
  authenticatedPage: async ({ page, testUser }, use) => {
    await loginViaSdkAuth(page, testUser.email, testUser.password);
    await use(page);
  },
});

export { expect } from '@playwright/test';

/**
 * Login via Bridge auth flow. Assumes demo app is on baseURL.
 */
export async function loginViaBridgeAuth(
  page: Page,
  email: string,
  password: string,
  envConfig: EnvironmentConfig
): Promise<void> {
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  const loginButton = page.locator('button:has-text("Login"), button:has-text("login")').first();
  await loginButton.waitFor({ state: 'visible', timeout: MED_TIMEOUT });
  await loginButton.click();

  await page.waitForURL(
    (url) => {
      const s = url.toString();
      return s.includes('/auth/') || s.includes('/login');
    },
    { timeout: LONG_TIMEOUT }
  );

  await page.waitForLoadState('domcontentloaded');

  const bodyText = await page.locator('body').textContent().catch(() => '');
  if (
    bodyText.includes('NBLOCKS_APP_UNAUTHORIZED_EXCEPTION') ||
    bodyText.includes('App is unauthenticated')
  ) {
    throw new Error(
      `Bridge auth returned "App is unauthenticated" (invalid APP ID or auth backend not accepting this app). ` +
        `Ensure bridge-api is running (LOCAL_TEST_DATA_API_URL), the test app is registered, and the demo uses the same app (pre-setup writes NEXT_PUBLIC_BRIDGE_APP_ID). ` +
        `URL: ${page.url()}`
    );
  }

  const emailInput = page.locator('#email, input[name="username"], input[type="email"]').first();
  await emailInput.waitFor({ state: 'visible', timeout: MED_TIMEOUT });
  await emailInput.fill(email);

  const continueButton = page.locator('button[type="submit"]:has-text("Continue")').first();
  await continueButton.waitFor({ state: 'visible', timeout: MED_TIMEOUT });
  await continueButton.click();

  const passwordInput = page.locator('#password, input[name="password"], input[type="password"]').first();
  await passwordInput.waitFor({ state: 'visible', timeout: MED_TIMEOUT });
  await passwordInput.fill(password);

  const signInButton = page.locator('button[type="submit"]:has-text("Sign in")').first();
  await signInButton.waitFor({ state: 'visible', timeout: MED_TIMEOUT });
  await signInButton.click();

  await page.waitForURL(
    (url) => {
      const s = url.toString();
      return !s.includes('/auth/login') && !s.includes('/login');
    },
    { timeout: LONG_TIMEOUT }
  ).catch(() => {});

  await page.waitForLoadState('networkidle');

  if (page.url().includes('/choose-user') || page.url().includes('/chooseTenantUser')) {
    const workspaceButtons = page.locator('button:has(h3)');
    await workspaceButtons.first().waitFor({ state: 'visible', timeout: MED_TIMEOUT }).catch(() => {});
    const count = await workspaceButtons.count();
    if (count > 0) await workspaceButtons.first().click();
    await page.waitForURL((url) => !url.pathname.includes('/choose-user'), { timeout: LONG_TIMEOUT }).catch(() => {});
  }

  await page.waitForLoadState('networkidle');

  const hasTokens = await page.evaluate(() => {
    const token = localStorage.getItem('bridge_access_token');
    return !!token;
  });

  if (!hasTokens) {
    throw new Error(`Login appeared to succeed but no bridge_access_token in localStorage. URL: ${page.url()}`);
  }
}

/**
 * Login via the in-app SDK auth flow (the `<LoginForm>` rendered on `/auth/login`).
 * Mirrors `bridge-svelte/e2e/playwright/fixtures/auth.ts::loginViaSdkAuth`.
 *
 * Unlike `loginViaBridgeAuth` (which redirects to hosted auth), SDK auth posts
 * credentials directly to auth-core and stores `bridge_tokens` in localStorage.
 */
export async function loginViaSdkAuth(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  console.log(`[sdk-login] Starting SDK login for ${email}`);

  // The demo keeps a persistent live-channel WebSocket open, so 'networkidle'
  // can never fire and would hang here. Wait for DOM readiness instead and rely
  // on the explicit element waits below.
  await page.goto('/auth/login', { waitUntil: 'domcontentloaded' });

  const emailInput = page.locator('#login-email');
  await emailInput.waitFor({ state: 'visible', timeout: MED_TIMEOUT });
  await emailInput.fill(email);

  const passwordInput = page.locator('#login-password');
  await passwordInput.fill(password);

  const signInBtn = page.locator('button[type="submit"]:has-text("Sign in")');
  await signInBtn.click();

  await page.waitForFunction(
    () => {
      const raw = (() => { const __k = Object.keys(localStorage).find((x) => x === 'bridge_tokens' || x.startsWith('bridge_tokens:')); return __k ? localStorage.getItem(__k) : null; })();
      if (!raw) return false;
      try {
        const tokens = JSON.parse(raw);
        return !!tokens?.accessToken;
      } catch {
        return false;
      }
    },
    { timeout: LONG_TIMEOUT },
  );

  // Wait for the post-login navigation to leave /auth/login. The demo's LoginForm
  // pushes to '/' on success; with a paywall configured the user is then bounced
  // to '/welcome'. Either way we just need to be off the login page before the
  // caller proceeds. Don't pin a specific destination (it varies by config) and
  // don't wait on 'networkidle' (the live WS keeps the network busy).
  await page
    .waitForURL((url) => !url.pathname.startsWith('/auth/login'), { timeout: MED_TIMEOUT })
    .catch(() => {
      /* some configs render the authed view in place without a route change */
    });

  console.log(`[sdk-login] SDK login complete for ${email}. Current URL: ${page.url()}`);
}
