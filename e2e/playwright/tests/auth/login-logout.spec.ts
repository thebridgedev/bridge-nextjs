/**
 * Auth: login redirect, navbar when logged in, logout.
 */

import { test, expect } from '../../fixtures/auth';
import { createCleanContext } from '../../fixtures/clean-page';
import { loginViaBridgeAuth } from '../../fixtures/auth';
import { getCurrentEnvironment, getEnvironmentConfig } from '../../config/environments';
import { MED_TIMEOUT } from '../../fixtures/timeouts';

test.describe('Auth login and logout', () => {
  test('clicking login redirects to Bridge auth URL', async ({ browser }) => {
    const { page, cleanup } = await createCleanContext(browser);
    try {
      const env = getCurrentEnvironment();
      const config = getEnvironmentConfig(env);
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const loginButton = page.locator('button:has-text("Login"), button:has-text("login")').first();
      await loginButton.waitFor({ state: 'visible', timeout: MED_TIMEOUT });
      await loginButton.click();

      await expect(page).toHaveURL((url) => url.toString().includes('/auth/') || url.toString().includes('/login'));
    } finally {
      await cleanup();
    }
  });

  test('after login, navbar shows authenticated links and logout', async ({ authenticatedPage, testUser }) => {
    const page = authenticatedPage;
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('link', { name: /team|protected/i }).first()).toBeVisible({ timeout: MED_TIMEOUT });
    await expect(page.getByRole('button', { name: /logout/i })).toBeVisible({ timeout: MED_TIMEOUT });
  });

  test('logout clears state and shows login again', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const logoutButton = page.getByRole('button', { name: /logout/i });
    await logoutButton.click();
    await page.waitForLoadState('networkidle');

    // After logout: home may show login link, or we're on /login with Login button
    const loginLink = page.getByRole('link', { name: /Start authentication flow|Login/i });
    const loginButton = page.locator('button:has-text("Login"), button:has-text("login")').first();
    await expect(loginLink.or(loginButton).first()).toBeVisible({ timeout: MED_TIMEOUT });
  });
});
