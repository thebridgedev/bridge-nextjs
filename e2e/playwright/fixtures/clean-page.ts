import * as path from 'path';
import type { Browser, BrowserContext, Page } from '@playwright/test';

/**
 * Base state written by global-setup: `localStorage['bridge:appId']` only, no
 * auth tokens. The demo takes its app id from there (the test env files leave
 * NEXT_PUBLIC_BRIDGE_APP_ID empty — TBP-721), so a context without it boots a
 * demo with no app at all.
 */
const BASE_STATE_PATH = path.resolve(__dirname, '../.auth/base-state.json');

/**
 * Creates a fresh browser context with no auth state but with the E2E app id.
 */
export async function createCleanContext(browser: Browser): Promise<{
  context: BrowserContext;
  page: Page;
  cleanup: () => Promise<void>;
}> {
  const context = await browser.newContext({ storageState: BASE_STATE_PATH });
  const page = await context.newPage();
  return {
    context,
    page,
    cleanup: async () => {
      await page.close();
      await context.close();
    },
  };
}
