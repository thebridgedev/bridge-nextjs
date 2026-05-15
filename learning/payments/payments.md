# Payments

In-app plan selection and Stripe Checkout via `@nebulr-group/bridge-nextjs`.

## Install the optional peer

For Stripe Checkout flows:

```bash
npm install @stripe/stripe-js
```

(Not needed if all your plans are free.)

## Plan selection page

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

`<PlanSelector>`:
- Loads plans + subscription status on mount via `loadSubscription()`.
- Renders a card per plan.
- Free plans → `selectFreePlan(planKey)` (no redirect).
- Paid plans, no existing payment method → Stripe Checkout via `startCheckout`.
- Paid plans, existing payment method → `changePlan` (in-app, no redirect).

## Success and cancel pages

```tsx
// app/subscription/success/page.tsx
'use client';
import { useEffect } from 'react';
import { loadSubscription } from '@nebulr-group/bridge-nextjs/client';

export default function SuccessPage() {
  useEffect(() => { void loadSubscription(); }, []);
  return <p>Subscription active. <a href="/">Continue</a></p>;
}

// app/subscription/cancel/page.tsx
export default function CancelPage() {
  return <p>Checkout cancelled. <a href="/subscription">Try again</a></p>;
}
```

## Why the `successUrl` matters

Stripe Checkout appends `?session_id=cs_test_…` to `successUrl`. `<BridgeProvider>`'s mount effect saves this to `sessionStorage` before any client-side router can strip it. The next `loadSubscription()` call picks it up and the backend syncs the subscription.

If the session_id is lost, the user may see a stale "no plan" state after checkout — that's the symptom of broken preservation.

## Reading subscription state elsewhere

```tsx
'use client';
import { useSubscription, loadSubscription } from '@nebulr-group/bridge-nextjs/client';
import { useEffect } from 'react';

export function PlanBadge() {
  const { status, loading } = useSubscription();
  useEffect(() => { if (!status && !loading) void loadSubscription(); }, [status, loading]);
  return <span>{status?.plan ?? 'No plan'}</span>;
}
```

## Common pitfalls

- **`@stripe/stripe-js` not installed.** Paid plan selection throws "Failed to load Stripe". Install the peer.
- **Plans don't render.** Check the Bridge admin UI — plans must be configured on the app, with at least one price offer each.
- **Free plan flow:** even free plans need a `Plan` definition in the admin UI. `<PlanSelector>` won't render anything if `getPlans()` returns an empty array.
