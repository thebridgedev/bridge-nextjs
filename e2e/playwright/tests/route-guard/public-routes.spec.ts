/**
 * Public routes — home page accessible without login.
 */

import { test, expect } from '@playwright/test';
import { MED_TIMEOUT } from '../../fixtures/timeouts';

test.describe('Public routes', () => {
  test('home page is accessible without login', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveURL((url) => url.pathname === '/' || url.pathname === '');
    const heading = page.locator('h1');
    await expect(heading).toBeVisible({ timeout: MED_TIMEOUT });
  });
});
