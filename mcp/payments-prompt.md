# Bridge Next.js — Payments / Subscription Prompt

You are integrating in-app plan selection and Stripe Checkout into a Next.js 15+ App Router project using **`@nebulr-group/bridge-nextjs`**. The SDK renders plans directly inside the app — there is **no handover redirect** to a separate plan-selection portal.

## Prerequisites

- The integration prompt is complete.
- The Bridge app has Stripe configured (or no Stripe — free-plan-only flows work without).
- For Stripe Checkout flows, install the optional peer:

```bash
npm install @stripe/stripe-js
```

## Migration check

If the codebase still calls `planService.redirectToPlanSelection()`, remove it. The new SDK pattern replaces that handover redirect with `<PlanSelector />` mounted inline.

## Wire the subscription pages

### Plan selection — `app/subscription/page.tsx`

```tsx
'use client';
import { PlanSelector } from '@nebulr-group/bridge-nextjs/client';

export default function SubscriptionPage() {
  return (
    <PlanSelector
      successUrl={`${window.location.origin}/subscription/success`}
      cancelUrl={`${window.location.origin}/subscription/cancel`}
      onSelect={({ plan }) => console.log('Selected plan', plan.key)}
    />
  );
}
```

Free plans are selected directly via `selectFreePlan`. Paid plans redirect to Stripe Checkout via `startCheckout` and `@stripe/stripe-js`.

### Success page — `app/subscription/success/page.tsx`

```tsx
'use client';
import { useEffect } from 'react';
import { loadSubscription } from '@nebulr-group/bridge-nextjs/client';

export default function SuccessPage() {
  // Re-fetch subscription so the UI reflects the new plan.
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

## Stripe Checkout session_id preservation

When Stripe redirects back to `successUrl`, it appends `?session_id=cs_test_…`. `BridgeProvider`'s mount effect persists this to `sessionStorage` before any client-side navigation can strip it. `loadSubscription()` then picks it up to trigger a server-side sync.

## Reading subscription state

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

## Auth-core methods used internally

- `selectFreePlan(planKey)`
- `changePlan(planKey, priceOffer)` — when payments are already set up
- `startCheckout(planKey, priceOffer, { successUrl, cancelUrl })`
- `getSubscriptionStatus()`, `getPlans()` — called via `loadSubscription()`

## Integration checklist

- [ ] `@stripe/stripe-js` installed (only required for paid plans with Stripe).
- [ ] `app/subscription/page.tsx` mounts `<PlanSelector />`.
- [ ] `app/subscription/success/page.tsx` and `app/subscription/cancel/page.tsx` exist.
- [ ] Both routes are protected by middleware or `<ProtectedRoute>`.
- [ ] **No legacy `planService.redirectToPlanSelection()` calls remain.**

## Verify

1. Sign in.
2. Navigate to `/subscription`.
3. Plans render in cards.
4. Click a free plan — `loadSubscription` re-fetches and the card shows "Current plan".
5. Click a paid plan — redirected to Stripe Checkout.
6. Complete checkout — returned to `/subscription/success`, subscription status reflects new plan.
