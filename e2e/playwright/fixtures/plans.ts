/**
 * Plans the suite provisions ahead of time, on every worker app, in
 * global-setup (TBP-721). Shared from here so the specs and the setup cannot
 * drift apart.
 */

/**
 * The trial plan bridge-api binds every Playwright test tenant to.
 *
 * `POST /account/test/playwright/account` hard-codes `plan: 'TEAM'`, so an app
 * without it cannot create a single test account: every spec that takes
 * `testUser` / `authenticatedPage` dies in fixture setup with
 * `404 The app: … has no plan with key: TEAM`. That is what 23 of the stage
 * failures were — welcome-paywall used to delete TEAM app-wide to reach the
 * "no plan" state, while four other workers kept creating accounts on the same
 * app (and an interrupted run left it deleted for good).
 *
 * Mirrors bridge-api's own seed in `setup-test-app` exactly, so `ensure-plan`
 * restores the plan the API expects rather than inventing a variant.
 */
export const TEAM_PLAN = {
  key: 'TEAM',
  name: 'Team',
  trial: true,
  trialDays: 14,
  prices: [{ amount: 99, currency: 'EUR', recurrenceInterval: 'month' }],
};

/**
 * `welcome-paywall.spec.ts` drives a real Stripe Checkout, so its plan's Stripe
 * price has to be synced and active *before* the test clicks "Select". A plan
 * created inside the test races bridge-api's async price-sync/archive sweep
 * (`_getActiveStripePrice` → 500 "Cannot find a matching Stripe price").
 *
 * The key is therefore STABLE and the plan is created via `ensure-plan`
 * (create-if-absent) in `global-setup.ts`, once per worker app, and never
 * deleted — so on every run after the first it is simply reused, with no Stripe
 * work at all.
 */
export const PAYWALL_PLAN = {
  key: 'e2e-paywall-pro',
  currency: 'USD',
  definition: {
    key: 'e2e-paywall-pro',
    name: 'Paywall Pro',
    description: 'Paid plan for welcome-paywall E2E (stable, reused across runs)',
    trial: false,
    trialDays: 0,
    prices: [{ amount: 2900, currency: 'USD', recurrenceInterval: 'month' }],
  },
};
