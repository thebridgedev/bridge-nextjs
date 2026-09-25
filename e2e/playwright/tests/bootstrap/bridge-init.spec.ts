/**
 * Bootstrap / Bridge initialization tests for bridge-nextjs demo.
 */

import { test, expect, waitForHydration } from '../../fixtures/auth';
import { MED_TIMEOUT } from '../../fixtures/timeouts';

test.describe('Bridge Initialization', () => {
  test('demo app loads without critical console errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto('/');
    // What this test waits for is "the app finished booting" — i.e. hydrated,
    // which is when client-side console errors would have fired. Not network
    // idle: the SDK's realtime WebSocket means that never arrives (TBP-721).
    await waitForHydration(page);

    const critical = consoleErrors.filter(
      (err) =>
        !err.includes('favicon') &&
        !err.includes('404') &&
        !err.includes('Failed to load resource')
    );
    expect(critical).toEqual([]);
  });

  test('home page renders with bridge demo content', async ({ page }) => {
    await page.goto('/');

    const heading = page.locator('h1');
    await expect(heading).toBeVisible({ timeout: MED_TIMEOUT });
    await expect(heading).toContainText('bridge');
  });
});
