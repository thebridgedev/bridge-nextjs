/**
 * Feature flags — demo exposes feature flag UI; authenticated user can see flag state.
 */

import { test, expect } from '@playwright/test';
import { MED_TIMEOUT } from '../../fixtures/timeouts';

test.describe('Feature flags', () => {
  test('feature flag section is visible on home page', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const featureSection = page.locator('text=Feature Flag');
    await expect(featureSection.first()).toBeVisible({ timeout: MED_TIMEOUT });
  });
});
