/**
 * Token persistence — after login, tokens survive page reload.
 */

import { test, expect } from '../../fixtures/auth';
import { MED_TIMEOUT } from '../../fixtures/timeouts';

test.describe('Token persistence', () => {
  test('after login, tokens persist after page reload', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const hasBefore = await page.evaluate(() => !!localStorage.getItem('bridge_access_token'));
    expect(hasBefore).toBe(true);

    await page.reload();
    await page.waitForLoadState('networkidle');

    const hasAfter = await page.evaluate(() => !!localStorage.getItem('bridge_access_token'));
    expect(hasAfter).toBe(true);
  });
});
