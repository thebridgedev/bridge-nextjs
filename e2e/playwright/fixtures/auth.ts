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

  authenticatedPage: async ({ page, testUser, envConfig }, use) => {
    await loginViaBridgeAuth(page, testUser.email, testUser.password, envConfig);
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
