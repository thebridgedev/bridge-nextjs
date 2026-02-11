/**
 * Team management — team page loads for authenticated user.
 */

import { test, expect } from '../../fixtures/auth';
import { MED_TIMEOUT } from '../../fixtures/timeouts';

test.describe('Team management', () => {
  test('authenticated user can open team page', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    await page.goto('/team');
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveURL((url) => url.pathname.includes('team'));
    const body = page.locator('body');
    await expect(body).toBeVisible({ timeout: MED_TIMEOUT });
  });
});
