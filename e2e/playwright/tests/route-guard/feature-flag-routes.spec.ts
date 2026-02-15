/**
 * Feature-flag guarded routes — if demo has one, unauthenticated behavior.
 */

import { test, expect } from '@playwright/test';
import { MED_TIMEOUT } from '../../fixtures/timeouts';

test.describe('Feature flag routes', () => {
  test('feature-flag-example page loads', async ({ page }) => {
    await page.goto('/feature-flag-example');
    await page.waitForLoadState('networkidle');

    const body = page.locator('body');
    await expect(body).toBeVisible({ timeout: MED_TIMEOUT });
  });
});
