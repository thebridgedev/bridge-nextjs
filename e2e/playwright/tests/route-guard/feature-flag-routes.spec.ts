/**
 * Feature-flag guarded routes — if demo has one, unauthenticated behavior.
 */

import { test, expect } from '../../fixtures/auth';
import { MED_TIMEOUT } from '../../fixtures/timeouts';

test.describe('Feature flag routes', () => {
  test('feature-flag-example page loads', async ({ page }) => {
    await page.goto('/feature-flag-example');

    const body = page.locator('body');
    await expect(body).toBeVisible({ timeout: MED_TIMEOUT });
  });
});
