/**
 * Feature flags (FF 2.0) — the demo home renders the FF 2.0 <FeatureFlag>
 * component (`flagKey` + `defaultValue`, children + fallback). For `demo-flag`
 * exactly one of the on / off branches renders for the current user.
 *
 * Reconciled from the legacy nextjs spec (which only asserted that a "Feature
 * Flag" heading was visible) to FF 2.0 behavior, mirroring bridge-svelte's
 * feature-flags.spec.ts XOR check. Assertions strengthened, never weakened.
 */

import { test, expect } from '@playwright/test';
import { MED_TIMEOUT } from '../../fixtures/timeouts';

test.describe('Feature flags', () => {
  test('feature flag section is visible on home page', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await expect(
      page.locator('h2:has-text("Feature Flag Examples")'),
    ).toBeVisible({ timeout: MED_TIMEOUT });
  });

  test('<FeatureFlag> renders exactly one branch for demo-flag', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // The "Flag with fallback" card renders either the on branch
    // (data-testid="demo-flag-on") or the fallback (data-testid="demo-flag-off")
    // — never both, never neither.
    const on = page.getByTestId('demo-flag-on');
    const off = page.getByTestId('demo-flag-off');

    // Wait for the FF 2.0 client cache to resolve so the component has settled.
    await expect(async () => {
      const onVisible = await on.isVisible().catch(() => false);
      const offVisible = await off.isVisible().catch(() => false);
      // XOR — exactly one branch must be rendered.
      expect(onVisible !== offVisible).toBeTruthy();
    }).toPass({ timeout: MED_TIMEOUT });
  });
});
