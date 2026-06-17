# Bridge Next.js — Billing

You are wiring **billing UI** into a Next.js 15+ App Router application that uses The Bridge with **`@nebulr-group/bridge-nextjs`**. Plans and Stripe are configured elsewhere — this guide covers the frontend only: the subscription page, lifecycle notices, the plan-selection paywall, quota/entitlement UI, and the billing portal. The SDK renders plans directly inside the app — there is **no handover redirect** to a separate plan-selection portal.

> `<BridgeProvider>` (in your root layout) auto-bootstraps the billing surface — it reads `NEXT_PUBLIC_BRIDGE_APP_ID`, connects the live channel, and wires the reactive billing stores. The drop-in components below need no extra setup beyond being rendered inside the provider.

## Prerequisites

- The integration prompt is complete (`<BridgeProvider>` in `app/layout.tsx`, OAuth callback route, `NEXT_PUBLIC_BRIDGE_APP_ID` set).
- The Bridge app has at least one plan. If a plan has a price, Stripe must be connected, or `<PlanSelector>` silently fails when a user picks a paid plan. Free-only setups can skip the Stripe check.
- For Stripe Checkout flows, install the optional peer:

```bash
npm install @stripe/stripe-js
```

(Not needed if all your plans are free.)

## Migration check

If the codebase still calls `planService.redirectToPlanSelection()`, remove it. The new SDK pattern replaces that handover redirect with `<PlanSelector />` mounted inline.

## Step 1 — Subscription page

Create `app/subscription/page.tsx`:

```tsx
'use client';
import { PlanSelector } from '@nebulr-group/bridge-nextjs/client';

export default function SubscriptionPage() {
  return (
    <PlanSelector
      successUrl={`${window.location.origin}/subscription/success`}
      cancelUrl={`${window.location.origin}/subscription/cancel`}
    />
  );
}
```

`<PlanSelector>` handles everything: loads plans + status, shows the current plan, routes free-plan selection directly (`selectFreePlan`), switches active subscribers in-app (`changePlan`), and launches Stripe Checkout for new paid plans (`startCheckout` + `@stripe/stripe-js`).

**`<PlanSelector>` props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `successUrl` | `string` | required | Absolute URL Stripe returns to after a successful payment |
| `cancelUrl` | `string` | required | Absolute URL Stripe returns to on cancel |
| `onSelect` | `({ plan, price }) => void` | — | Called after free-plan selection or plan change |
| `planCard` | `(ctx) => ReactNode` | — | Override the default plan card layout |

### Success page — `app/subscription/success/page.tsx`

```tsx
'use client';
import { useEffect } from 'react';
import { loadSubscription } from '@nebulr-group/bridge-nextjs/client';

export default function SuccessPage() {
  useEffect(() => { void loadSubscription(); }, []);
  return <p>Thanks — your subscription is active. <a href="/">Go home</a></p>;
}
```

### Cancel page — `app/subscription/cancel/page.tsx`

```tsx
export default function CancelPage() {
  return <p>Checkout cancelled. <a href="/subscription">Try again</a></p>;
}
```

**Stripe Checkout session_id preservation.** When Stripe redirects back to `successUrl`, it appends `?session_id=cs_test_…`. `<BridgeProvider>`'s mount effect persists this before any client-side navigation can strip it; `loadSubscription()` picks it up to trigger the server-side sync. The OAuth callback route also preserves `?payment=` by default (`preserveQueryParams: ['payment']`). Do not strip these params in custom redirects.

## Step 2 — Billing notice banner

Add `<BridgeBillingNotice />` to the root layout (inside `<BridgeProvider>`). It renders nothing when billing is healthy and automatically shows the right message for payment failures, trial endings, dunning retries, and cancellations:

```tsx
'use client';
import { BridgeBillingNotice } from '@nebulr-group/bridge-nextjs/client';

<BridgeBillingNotice />
```

Each state has two role variants: admins get an action CTA ("Update card", "Upgrade"); members get an informational variant. Pass `mode="hard"` to render a full-screen lockscreen when the workspace is billing-locked.

To show the current plan + status badge anywhere (e.g. a header), drop in `<BridgeSubscriptionStatus />` — no props required.

## Step 2b — Plan-selection paywall (default)

Set this up by default: a signed-in tenant with no plan can't use the app until they pick one. Two options.

**Option A — in-layout overlay (recommended for Next.js).** Wrap the app in `<BridgePaywall>`:

```tsx
'use client';
import { BridgePaywall } from '@nebulr-group/bridge-nextjs/client';

<BridgePaywall successRedirect="/">
  {children}
</BridgePaywall>
```

`<BridgePaywall>` renders a fullscreen plan-selector overlay when `shouldSelectPlan` is true, then disappears once a plan is chosen. Props:

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `successRedirect` | `string` | `'/'` | Where to send the user after a successful Stripe payment |
| `cancelRedirect` | `string` | `'/'` | Where to send the user if they cancel checkout |
| `onSelect` | `({ plan, price }) => void` | — | Side-effect hook after free-plan or direct plan change |
| `heading` | `ReactNode` | "Choose a plan" | Override the modal heading |

`successRedirect` / `cancelRedirect` are resolved against `window.location.origin` and forwarded to the inner `<PlanSelector>` as `successUrl` / `cancelUrl`.

**Option B — dedicated welcome route.** Create `app/welcome/page.tsx` mounting `<PlanSelector />`, mark `/welcome` public in your route guard, and configure the bootstrap paywall redirect. The redirect is gated by the app-level `paymentsAutoRedirect` flag (`true` by default); set it `false` to turn the whole paywall off.

## Step 3 — Quota and entitlement UI (optional)

Skip if the plans have no per-resource limits or feature differences. (Quotas and entitlements are configured on plans in the admin, not in code.)

To show a live quota counter, drop in `<BridgeQuotaBanner metric="ai_completions" />` — it renders nothing if no quota is configured for the current plan, warns at ≥80%, and goes critical at ≥95% / over cap.

To gate a feature by entitlement, use the auth-core billing surface (re-exported as `useBridgeBilling` to avoid colliding with the unified `useBridge`):

```tsx
import { useBridgeBilling } from '@nebulr-group/bridge-nextjs/client';

if (useBridgeBilling().entitlements.can('ai_completions')) { /* ... */ }
```

Returns `false` until hydrated (fail-closed), updates live on plan change or quota exhaustion. The recommended pattern is a feature flag targeting `bridge:billing.entitlement.<key>` — see the Feature Flags prompt.

## Step 4 — Billing portal

To let users manage their payment method or cancel, add a button that calls `getBridgeAuth().getPortalUrl()` and redirects to the returned URL. Import `getBridgeAuth` from `@nebulr-group/bridge-nextjs/client`.

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
- [ ] `app/subscription/page.tsx` mounts `<PlanSelector />` with absolute `successUrl` / `cancelUrl`.
- [ ] `app/subscription/success/page.tsx` and `app/subscription/cancel/page.tsx` exist.
- [ ] Subscription routes protected by middleware or `<ProtectedRoute>`.
- [ ] `<BridgeBillingNotice />` added to the root layout (inside `<BridgeProvider>`).
- [ ] Paywall set up — `<BridgePaywall>` wrapping the app, OR a `/welcome` route + bootstrap paywall config.
- [ ] Quota/entitlement UI added if plans have limits.
- [ ] **No legacy `planService.redirectToPlanSelection()` calls remain.**

## Verify

1. Sign in.
2. Navigate to `/subscription` — plan cards render with correct prices.
3. Select a free plan — subscription updates immediately, no redirect.
4. Select a paid plan — Stripe Checkout launches; complete payment — returned to `/subscription/success`, status reflects the new plan.
5. Cancel payment — returned to `/subscription/cancel`.
6. Paywall: sign in as a new tenant with no plan — the `<BridgePaywall>` overlay (or `/welcome`) blocks the app until a plan is chosen.
7. Run `npm run build` — no TypeScript or import errors.

## Going further

This prompt covers the UI layer. For the runtime model behind it — how the live billing surface stays current, the full snapshot/quota field shapes, composing your own reactive hooks, reporting usage durably, entitlement-vs-flag gating, and gate-state handling — see the learning docs:

- **Payments / Billing 2.0:** `learning/payments/payments.md` (the "Billing 2.0 — live, reactive billing UI" section)
- **Live updates & the Bridge surface:** `learning/live-updates/live-updates.md` (snapshots vs events, connection/reconnection behavior)
