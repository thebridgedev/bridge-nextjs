/**
 * Protected routes — unauthenticated user redirected to login; authenticated user can access.
 */

import { test, expect } from '../../fixtures/auth';
import { MED_TIMEOUT } from '../../fixtures/timeouts';

test.describe('Protected routes', () => {
  test('unauthenticated user is redirected when visiting protected page', async ({ page }) => {
    await page.goto('/protected');
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveURL((url) => url.pathname.includes('/auth') || url.pathname.includes('/login') || page.url().includes('url/login'));
  });

  test('authenticated user can access protected page and sees content', async ({ authenticatedPage, testUser }) => {
    const page = authenticatedPage;
    await page.goto('/protected');
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveURL((url) => url.pathname.includes('protected'));
    const body = page.locator('body');
    await expect(body).toContainText(/protected|profile|welcome/i, { timeout: MED_TIMEOUT });
  });
});
