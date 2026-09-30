# Bridge Next.js — Billing

You are wiring **billing UI** into a Next.js 15+ App Router application that uses The Bridge with **`@nebulr-group/bridge-nextjs`**. Plans and Stripe are configured elsewhere — this guide covers the frontend only: the subscription page, lifecycle notices, the plan-selection paywall, quota/entitlement UI, and the billing portal. The SDK renders plans directly inside the app — there is **no handover redirect** to a separate plan-selection portal.

> `<BridgeProvider>` (in your root layout) auto-bootstraps the billing surface — it reads `NEXT_PUBLIC_BRIDGE_APP_ID`, connects the live channel, and wires the reactive billing stores. The drop-in components below need no extra setup beyond being rendered inside the provider.

## Decide first — which billing surface do you need?

Plans, prices, quotas and Stripe are configured in the Bridge admin, not in code. What you choose here is which drop-in to mount. Every one of them is reactive and needs nothing beyond being rendered inside `<BridgeProvider>`.

| You need | Mount | Notes |
|---|---|---|
| The subscription page, the paywall, and the checkout return pages | `app/subscription/[[...bridge]]/page.tsx` rendering `<BridgeBillingRoutes />` | ONE file. Serves `/subscription`, `/subscription/plan`, `/subscription/success`, `/subscription/error` — the defaults every redirect and Upgrade button point at |
| A signed-in tenant with no plan must pick one | Nothing more | The paywall redirect to `/subscription/plan` is on by default for an app with plans |
| An onboarding page at another address (`/welcome`) | `<BridgePaywallPage />` there + `billing: { paywallRoute: '/welcome' }` | Only if the developer asks for one — never create it unasked |
| Current plan + status badge anywhere | `<BridgeSubscriptionStatus />` | No props required |
| Lifecycle warnings — past due, trial ending, locked | `<BridgeBillingNotice />` | `mode="hard"` turns it into a blocking lockscreen when the workspace is locked |
| Plan limits | Nothing (level 0), `<QuotaGate metric>` (level 1), `useQuota(metric)` (level 2) | A backend `402 QUOTA_EXCEEDED` opens the upgrade dialog on its own |
| A feature only some plans include | `<FeatureFlag flagKey="…" defaultValue={false} upgrade>` with a flag ruled `bridge:billing.entitlement.<key> eq true` | `<Entitled to>` / `useEntitlements()` only if the developer asks for no flag |
| Let users manage their payment method or cancel | `<BillingPortalButton />` | Already on `/subscription` |

> **Never hardcode a billing-portal or Stripe URL.** `getBillingPortalUrl()` mints a portal session for the signed-in tenant; a pasted URL either expires or points at whichever workspace it was minted for. This has shipped as a bug before.

Everything above is client-side, imported from `@nebulr-group/bridge-nextjs/client`. Page files that only render a Bridge component need no `'use client'`.

## Prerequisites

- The integration prompt is complete (`<BridgeProvider>` in `app/layout.tsx`, `NEXT_PUBLIC_BRIDGE_APP_ID` set).
- The Bridge app has at least one plan. If a plan has a price, Stripe must be connected, or `<PlanSelector>` silently fails when a user picks a paid plan. Free-only setups can skip the Stripe check.
- For Stripe Checkout flows, install the optional peer:

```bash
npm install @stripe/stripe-js
```

(Not needed if all your plans are free.)

## Migration check

If the codebase still calls `planService.redirectToPlanSelection()`, remove it. The new SDK pattern replaces that handover redirect with `<PlanSelector />` mounted inline.

## Step 1 — Subscription pages (one file)

```tsx
// app/subscription/[[...bridge]]/page.tsx
import { BridgeBillingRoutes } from '@nebulr-group/bridge-nextjs/client';

export default function SubscriptionPage() {
  return <BridgeBillingRoutes />;
}
```

The double brackets make the catch-all optional so the bare `/subscription` matches. Do not also create `app/subscription/page.tsx` (Next.js refuses both). Do not create success/cancel/payment-error pages: the catch-all serves them.

## Step 2 — Billing notice banner

Add `<BridgeBillingNotice />` to the root layout, inside `<BridgeProvider>`. It renders nothing when billing is healthy and shows the right message for payment failures, trial endings, dunning retries and cancellations. Its CTA goes to `billing.manageRoute` (default `/subscription`, the page Step 1 serves). Pass `mode="hard"` for a full-screen lockscreen when the workspace is billing-locked.

## Step 3 — Plan limits (optional)

Skip if the plans have no limits. Count usage once, where the action happens: if the click calls the app's backend, the backend counts it (bridge-nestjs `@RequireQuota`); the page only calls it with `bridgeFetch()` and writes no quota code. A `402 QUOTA_EXCEEDED` answer opens the upgrade dialog `<BridgeProvider>` mounts.

```tsx
'use client';
import { bridgeFetch, QuotaGate } from '@nebulr-group/bridge-nextjs/client';

<QuotaGate metric="tickets">
  <button onClick={() => bridgeFetch('/api/tickets', { method: 'POST' })}>New ticket</button>
</QuotaGate>
```

`<QuotaGate>` (level 1) disables the button at a known hard cap; `useQuota('tickets')` (level 2) gives `{ loading, unlimited, used, limit, remaining }` for custom UI, with numbers `null` until Bridge answers. Do not write a quota `if`, a "limit reached" toast or a `/quota` endpoint.

For a plan feature, gate with a flag ruled `bridge:billing.entitlement.<key> eq true` and `<FeatureFlag flagKey="<key>" defaultValue={false} upgrade>` — see the Feature Flags prompt.

## Reading subscription state

Two surfaces, both reactive:

```tsx
'use client';
import { useSubscription, loadSubscription } from '@nebulr-group/bridge-nextjs/client';
import { useEffect } from 'react';

export function CurrentPlan() {
  const { status, loading } = useSubscription();
  useEffect(() => { if (!status && !loading) void loadSubscription(); }, [status, loading]);
  if (loading || !status) return null;
  return <p>Current plan: {status.plan ?? 'none'}</p>;
}
```

For canonical live billing state (plan + lifecycle status), read `useBridgeBilling().subscription.snapshot()` or subscribe via `useBridgeBilling().subscription.subscribe(fn)`. Report metered usage with `getBridgeAuth().usage.report(metric, n)` (fire-and-forget — do not `await`). Register side-effect handlers with `useBridgeBilling().handle({ 'subscription.plan_changed': fn, ... })`.

Auth-core methods used internally by `<PlanSelector>`: `selectFreePlan(planKey)`, `changePlan(planKey, priceOffer)`, `startCheckout(planKey, priceOffer, { successUrl, cancelUrl })`, `getSubscriptionStatus()`, `getPlans()` (the last two via `loadSubscription()`).

## Billing checklist

- [ ] `@stripe/stripe-js` installed (only required for paid plans with Stripe).
- [ ] `app/subscription/[[...bridge]]/page.tsx` renders `<BridgeBillingRoutes />`; no other `app/subscription/*` pages unless the developer asked to take one over.
- [ ] `<BridgeBillingNotice />` added to the root layout (inside `<BridgeProvider>`).
- [ ] Backend calls go through `bridgeFetch()`; no hand-written quota checks in the page.
- [ ] **No legacy `planService.redirectToPlanSelection()` calls remain.**

## Verify

1. Sign in.
2. Navigate to `/subscription` — plan cards render with correct prices.
3. Select a free plan — subscription updates immediately, no redirect.
4. Select a paid plan — Stripe Checkout launches; complete payment — returned to `/subscription/success`, status reflects the new plan.
5. Cancel payment — returned to `/subscription`.
6. Paywall: sign in as a new tenant with no plan — any page redirects to `/subscription/plan` until a plan is chosen.
7. Run `npm run build` — no TypeScript or import errors.

## Going further

This prompt covers the UI layer. For the runtime model behind it — how the live billing surface stays current, the full snapshot/quota field shapes, composing your own reactive hooks, reporting usage durably, entitlement-vs-flag gating, and gate-state handling — see the learning docs:

- **Payments / Billing 2.0:** `learning/payments/payments.md` (the "Billing 2.0 — live, reactive billing UI" section)
- **Live updates & the Bridge surface:** `learning/live-updates/live-updates.md` (snapshots vs events, connection/reconnection behavior)
