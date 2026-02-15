/**
 * Bootstrap / Bridge initialization tests for bridge-nextjs demo.
 */

import { test, expect } from '@playwright/test';
import { MED_TIMEOUT } from '../../fixtures/timeouts';

test.describe('Bridge Initialization', () => {
  test('demo app loads without critical console errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

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
    await page.waitForLoadState('networkidle');

    const heading = page.locator('h1');
    await expect(heading).toBeVisible({ timeout: MED_TIMEOUT });
    await expect(heading).toContainText('bridge');
  });
});
