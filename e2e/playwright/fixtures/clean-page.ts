import type { Browser, BrowserContext, Page } from '@playwright/test';

export async function createCleanContext(browser: Browser): Promise<{
  context: BrowserContext;
  page: Page;
  cleanup: () => Promise<void>;
}> {
  const context = await browser.newContext();
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
