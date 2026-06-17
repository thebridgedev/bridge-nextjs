/**
 * Welcome Paywall — first-time-user end-to-end flow
 *
 * Ported near-verbatim from bridge-svelte's
 * `subscription/welcome-paywall.spec.ts`. Covers the full first-time-user
 * paywall flow: BridgeBootstrap gates the paywall redirect on
 * `getSubscriptionStatus()` (shouldSelectPlan + paymentsAutoRedirect). Proves a
 * brand-new user is:
 *
 *   1. Forced to /welcome when they try to hit any protected route
 *   2. Able to complete Stripe Checkout from the PlanSelector on /welcome
 *   3. Landed on an in-app (non-paywall) route after returning from Stripe
 *   4. NOT bounced back to /welcome on subsequent navigation to protected routes
 *
 * Requires STRIPE_TEST_PK / STRIPE_TEST_SK env vars (skipped otherwise).
 *
 * ⚠ DEMO DEPENDENCY (flagged in the §11 report): this spec requires the nextjs
 * demo to expose a `/welcome` paywall route and a paywall-redirect config
 * (svelte's demo wires `billing.paywallRoute: '/welcome'` + a `/welcome` route +
 * `{ match: '/welcome', public: true }` in the route guard). That is
 * bootstrap-layer demo wiring, NOT part of the Billing 2.0 component slice. Until
 * it lands in the nextjs demo this spec will fail step 2 even with Stripe keys —
 * but it is skipped without Stripe keys, so it does not break the suite.
 */

import { test, expect, loginViaSdkAuth } from '../../fixtures/auth';
import { LONG_TIMEOUT, MED_TIMEOUT } from '../../fixtures/timeouts';

const STRIPE_TEST_PK = process.env.STRIPE_TEST_PK || '';
const STRIPE_TEST_SK = process.env.STRIPE_TEST_SK || '';
const hasStripeKeys = !!STRIPE_TEST_PK && !!STRIPE_TEST_SK;

test.describe('Welcome Paywall — first-time user flow', () => {
  test.skip(!hasStripeKeys, 'STRIPE_TEST_PK / STRIPE_TEST_SK env vars required');

  // Pre-warm the demo routes this flow touches. The harness runs the demo via
  // `next dev` (webpack), which compiles each route on FIRST navigation. On a
  // cold `.next` cache that first compile (10-30s/route) blocks page.goto long
  // enough to blow the per-test budget. Warming the routes here — outside the
  // per-test timeout — moves the compile cost off the timed flow. Idempotent and
  // cheap on a warm cache; runs only when Stripe keys are present (else the
  // suite is skipped anyway).
  test.beforeAll(async ({ baseURL }) => {
    if (!hasStripeKeys || !baseURL) return;
    const routes = ['/auth/login', '/welcome', '/protected', '/subscription'];
    await Promise.all(
      routes.map((r) =>
        fetch(`${baseURL}${r}`, { method: 'GET' }).catch(() => {
          /* warm-up only — failures are non-fatal */
        }),
      ),
    );
  });

  test('signup → protected route bounces to /welcome → pay → land in app', async ({
    page,
    testUser,
    testDataClient,
    envConfig,
  }) => {
    // Stripe Checkout round-trip alone can take 20-40s; the default 60s
    // budget leaves no room for the rest of the flow + final assertions.
    test.setTimeout(120_000);

    // Determinism rationale: the old per-run timestamped key minted a brand-new
    // plan + Stripe price on every run, then immediately drove checkout against
    // it — racing bridge-api's async Stripe price-sync/archive sweep
    // (`_getActiveStripePrice` 500 "Cannot find a matching Stripe price"), and
    // leaking a fresh Stripe price each run that piled up in the shared test
    // account and made the sweep ever slower. With a stable key + create-if-absent
    // (`ensurePlan`), the plan + its Stripe price are created and synced exactly
    // ONCE; every subsequent run reuses them with NO Stripe re-sync, so by
    // checkout time the price has been active+checkout-ready for ages. The plan is
    // intentionally NOT deleted in teardown — it persists for reuse. See TBP-408.
    const planKey = 'e2e-paywall-pro';

    try {
      // ---- Arrange: configure the app for Stripe + paywall, and ensure the paid plan
      await testDataClient.configureApp({
        paymentsAutoRedirect: true,
        stripeEnabled: true,
        stripePublicKey: STRIPE_TEST_PK,
        stripeSecretKey: STRIPE_TEST_SK,
        currency: 'USD',
      });

      // Create-if-absent: on the first ever run this creates the plan and syncs
      // its Stripe price once; on every later run it returns the existing plan
      // WITHOUT re-triggering the Stripe archive sweep (the flake source).
      await testDataClient.ensurePlan({
        key: planKey,
        name: 'Paywall Pro',
        description: 'Paid plan for welcome-paywall E2E (stable, reused across runs)',
        trial: false,
        trialDays: 0,
        prices: [{ amount: 2900, currency: 'USD', recurrenceInterval: 'month' }],
      });

      // ---- 1a. Force the "no plan selected" state. createPlaywrightTestAccount
      //          auto-binds the new tenant to the app's hardcoded `TEAM` trial
      //          plan, so `shouldSelectPlan` would be `false` out of the gate.
      //          Deleting the TEAM plan leaves the tenant pointing at a plan
      //          key that no longer exists in the app → the API flips
      //          shouldSelectPlan back to `true`. We recreate TEAM in finally
      //          to restore the app's seeded shape.
      await testDataClient.deletePlan('TEAM').catch(() => {});

      // ---- 1. Sign in the fresh test user via SDK auth (no plan selected yet).
      //         loginViaSdkAuth establishes the tokens in localStorage. We do NOT
      //         rely on the demo's post-login soft navigation settling (it is
      //         flaky under `next dev` + Playwright). The authoritative paywall
      //         assertion is the FULL navigation in step 2 below.
      await loginViaSdkAuth(page, testUser.email, testUser.password);

      // ---- 2. Navigate to a protected route → expect the paywall to bounce us to
      //         /welcome. This FULL navigation re-runs BridgeProvider's bootstrap
      //         + paywall effect against the now-authenticated token — the core
      //         scenario the paywall fix targets, and a robust mechanism (no soft-
      //         navigation race). It also lands the page on a settled /welcome so
      //         the localStorage read below is reliable.
      //
      //         waitUntil:'commit' so the demo's persistent live-channel
      //         WebSocket (which keeps 'load'/'networkidle' from settling) does
      //         not hang the navigation; the waitForURL below is the real settle.
      //         NOTE: known pre-existing harness limitation (TBP-405/406) — under
      //         `next dev` + Playwright the demo's always-on WebSocket can prevent
      //         client navigations from committing, which blocks this assertion in
      //         the local harness even though the paywall feature itself is wired
      //         correctly (verified via BridgeProvider config + effect logging).
      await page.goto('/protected', { waitUntil: 'commit' });
      await page.waitForURL('**/welcome', { timeout: LONG_TIMEOUT });
      expect(new URL(page.url()).pathname).toBe('/welcome');

      // ---- 2b. Sanity-check (via the API, from the test runner) that this tenant
      //          is paywall-eligible (shouldSelectPlan=true, paymentsAutoRedirect=
      //          true) — confirms the redirect above was driven by real tenant
      //          state, not a UI quirk. Read the access token from the now-settled
      //          /welcome page.
      const accessToken = await page.evaluate(() => {
        const k = Object.keys(localStorage).find(
          (x) => x === 'bridge_tokens' || x.startsWith('bridge_tokens:'),
        );
        const raw = k ? localStorage.getItem(k) : null;
        return raw ? (JSON.parse(raw).accessToken as string) : null;
      });
      expect(accessToken).toBeTruthy();

      const probeRes = await fetch(`${envConfig.apiBaseUrl}/account/subscription/status`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'x-app-id': envConfig.appId,
        },
      });
      const probeBody = await probeRes.json();
      expect(probeBody.shouldSelectPlan).toBe(true);
      expect(probeBody.paymentsAutoRedirect).toBe(true);

      // ---- 3. PlanSelector renders on /welcome and finishes loading
      const planSelector = page.locator('[data-bridge-plan-selector]');
      await expect(planSelector).toBeVisible({ timeout: MED_TIMEOUT });
      await expect(planSelector).not.toHaveAttribute('data-loading', 'true', {
        timeout: LONG_TIMEOUT,
      });

      // ---- 4. Click "Select" on the paid plan card → redirect to Stripe Checkout
      const paidPlanCard = page
        .locator('[data-bridge-plan-card]')
        .filter({ hasText: 'Paywall Pro' });
      await expect(paidPlanCard).toBeVisible({ timeout: MED_TIMEOUT });
      const paidPlanBtn = paidPlanCard.locator('button').first();
      await expect(paidPlanBtn).toBeVisible({ timeout: MED_TIMEOUT });
      await paidPlanBtn.click();

      await page.waitForURL((url) => url.hostname.includes('stripe.com'), {
        timeout: LONG_TIMEOUT,
      });
      expect(page.url()).toContain('stripe.com');

      // ---- 5. Fill Stripe test card (selectors match bridge-api stripe-payment.spec.ts)
      const cardInput = page
        .locator('#cardNumber, [data-testid="card-number-input"], input[name="cardNumber"]')
        .first();
      await cardInput.waitFor({ state: 'visible', timeout: MED_TIMEOUT });
      await cardInput.fill('4242424242424242');

      const expiryInput = page
        .locator('#cardExpiry, [data-testid="card-expiry-input"], input[name="cardExpiry"]')
        .first();
      await expiryInput.fill('1234'); // 12/34

      const cvcInput = page
        .locator('#cardCvc, [data-testid="card-cvc-input"], input[name="cardCvc"]')
        .first();
      await cvcInput.fill('123');

      const nameInput = page.locator('#billingName, input[name="billingName"]').first();
      if (await nameInput.isVisible().catch(() => false)) {
        await nameInput.fill('Playwright Test');
      }

      const zipInput = page
        .locator('#billingPostalCode, input[name="billingPostalCode"]')
        .first();
      if (await zipInput.isVisible().catch(() => false)) {
        await zipInput.fill('12345');
      }

      const submitButton = page.locator('button[type="submit"], .SubmitButton').first();
      await submitButton.click();

      // ---- 6. Stripe processes payment and redirects back to the demo's callback,
      //         which bootstrap recognises (stripe_success=1 + session_id) and
      //         resolves by confirming the checkout, refreshing tokens, and
      //         redirecting to the success redirect. Wait until we're back on the
      //         demo origin.
      await page.waitForURL(
        (url) => !url.hostname.includes('stripe.com'),
        { timeout: 60_000 } // Stripe processing can take a while
      );
      // Wait for the post-checkout subscription UI to finish rendering its
      // active-billing state. networkidle is unreliable here because the demo
      // keeps a persistent live-channel WebSocket open — the network never goes
      // idle. The nextjs demo surfaces active billing via PlanSelector's
      // data-state="active" (svelte uses a "Billing active" chip).
      await expect(page.locator('[data-bridge-plan-selector][data-state="active"]')).toBeVisible({
        timeout: LONG_TIMEOUT,
      });

      const postCheckoutUrl = page.url();
      const postCheckoutPath = new URL(postCheckoutUrl).pathname;

      // ---- 7. We must NOT have been bounced back to /welcome — the whole point
      //         of the paywall fix is that a paid user lands in the app.
      expect(postCheckoutPath).not.toBe('/welcome');
      expect(postCheckoutUrl).not.toContain('stripe.com');

      // ---- 8. Bonus: navigating to a fresh protected route should now succeed,
      //         not redirect to /welcome. waitUntil:'commit' for the same live-WS
      //         reason as step 2; the heading assertion below is the settle point.
      await page.goto('/protected', { waitUntil: 'commit' });

      // The protected page should render its heading once it settles — and the
      // paid user must NOT be bounced to /welcome. Assert the heading first
      // (deterministic settle), then the URL.
      await expect(page.locator('h1:has-text("Protected Page")')).toBeVisible({
        timeout: LONG_TIMEOUT,
      });
      const finalPath = new URL(page.url()).pathname;
      expect(finalPath).not.toBe('/welcome');
      expect(finalPath).toBe('/protected');
    } finally {
      // ---- Cleanup: restore the TEAM trial plan that other tests rely on and
      //               disable Stripe on the test app. The testUser is auto-cleaned
      //               by the fixture.
      //
      // We do NOT delete the stable `e2e-paywall-pro` plan: it is meant to persist
      // and be reused across runs so its Stripe price stays synced+active. Deleting
      // it would re-run the Stripe archive sweep AND force the next run to recreate
      // (and re-race) the price — exactly the flake this change removes.
      await testDataClient
        .createPlan({
          key: 'TEAM',
          name: 'Team',
          trial: true,
          trialDays: 14,
          prices: [{ amount: 99, currency: 'EUR', recurrenceInterval: 'month' }],
        })
        .catch(() => {});
      await testDataClient
        .configureApp({ paymentsAutoRedirect: false, stripeEnabled: false })
        .catch(() => {});
    }
  });
});
