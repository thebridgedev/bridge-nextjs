// What happens when someone picks a plan on <PlanSelector>.
//
// TBP-946 (port of bridge-svelte TBP-762 + TBP-813) — a pick that changes the
// plan right here (a Free pick, or a paid pick on an app without Stripe, which
// Bridge sets directly) re-reads the subscription, records the pick for the
// landing page's banner, and goes on to `successUrl`: the same place a Stripe
// checkout returns to. A page that passes `onSelect` takes over instead: no
// banner, no navigation. A workspace that already pays switches instantly, so
// that pick asks to confirm first (`confirm`, bridge-svelte TBP-33); the
// switch itself runs in <PlanSelector>'s confirmation dialog.
//
// Next.js difference from bridge-svelte, kept on purpose: Stripe returns
// straight to `successUrl` (auth-core makes it absolute and the API adds the
// session id); there is no callback route in between.

import type { Plan, PriceOfferSdk } from '@nebulr-group/bridge-auth-core';

export interface PlanPickAuth {
  selectFreePlan(planKey: string): Promise<unknown>;
  startCheckout(
    planKey: string,
    price: PriceOfferSdk,
    urls: { successUrl: string; cancelUrl: string },
  ): Promise<{ sessionId: string | null; checkoutUrl?: string | null }>;
}

export interface PlanPickOptions {
  /** The workspace already pays: a switch is instant and needs a confirm step. */
  paymentsEnabled: boolean;
  /** Where a completed pick or checkout lands. */
  successUrl: string;
  /** Where a cancelled checkout lands. */
  cancelUrl: string;
  onSelect?: (detail: { plan: Plan; price: PriceOfferSdk }) => void;
}

export interface PlanPickDeps {
  auth: PlanPickAuth;
  /** Re-read the subscription store. */
  refresh: () => Promise<void>;
  /** In-app navigation (`router.push`). */
  navigate: (url: string) => unknown;
  /** Leave the app (Stripe checkout). */
  leave: (url: string) => void;
  /** Make a path absolute for Stripe. */
  absolute?: (url: string) => string;
  /** TBP-813: record that the plan changed, for the landing page's banner. */
  complete?: (plan: Plan) => void;
}

/** `selected`: the plan changed here. `confirm`: ask first. `checkout`: off to Stripe. */
export type PlanPickOutcome = 'selected' | 'confirm' | 'checkout';

/** A $0 price on a plan with no metered cost is picked without checkout (TBP-275). */
export function isFreePick(plan: Plan, price: PriceOfferSdk): boolean {
  return price.amount === 0 && !(plan as Plan & { hasCost?: boolean }).hasCost;
}

export async function pickPlan(
  plan: Plan,
  price: PriceOfferSdk,
  opts: PlanPickOptions,
  deps: PlanPickDeps,
): Promise<PlanPickOutcome> {
  if (isFreePick(plan, price)) {
    await deps.auth.selectFreePlan(plan.key);
    await deps.refresh();
    await settle(plan, price, opts, deps);
    return 'selected';
  }
  if (opts.paymentsEnabled) return 'confirm';

  const abs = deps.absolute ?? ((u: string) => u);
  const session = await deps.auth.startCheckout(plan.key, price, {
    successUrl: abs(opts.successUrl),
    cancelUrl: abs(opts.cancelUrl),
  });
  if (!session.sessionId) {
    // Stripe not configured: Bridge set the plan directly.
    await deps.refresh();
    await settle(plan, price, opts, deps);
    return 'selected';
  }
  // Stripe.js removed `redirectToCheckout({ sessionId })` on 2025-09-30; use
  // the checkout URL directly, as bridge-svelte does.
  if (!session.checkoutUrl) throw new Error('Checkout session URL missing');
  deps.leave(session.checkoutUrl);
  return 'checkout';
}

async function settle(
  plan: Plan,
  price: PriceOfferSdk,
  opts: PlanPickOptions,
  deps: PlanPickDeps,
): Promise<void> {
  if (opts.onSelect) {
    opts.onSelect({ plan, price });
    return;
  }
  deps.complete?.(plan);
  await deps.navigate(opts.successUrl);
}
