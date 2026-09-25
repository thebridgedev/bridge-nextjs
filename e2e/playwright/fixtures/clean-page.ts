import type { Browser, BrowserContext, Page } from '@playwright/test';
import { currentWorkerApp } from './worker-app';

/**
 * Creates a fresh browser context with no auth state but with the E2E app id.
 *
 * The app id is this WORKER's app (TBP-721), seeded as
 * `localStorage['bridge:appId']` — the demo takes its app id from there (the
 * test env files leave NEXT_PUBLIC_BRIDGE_APP_ID empty), so a context without it
 * boots a demo with no app at all, and a context with another worker's id would
 * read one app's settings while the fixtures wrote another's.
 */
export async function createCleanContext(browser: Browser): Promise<{
  context: BrowserContext;
  page: Page;
  cleanup: () => Promise<void>;
}> {
  const context = await browser.newContext({
    storageState: currentWorkerApp().storageStatePath,
  });
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
