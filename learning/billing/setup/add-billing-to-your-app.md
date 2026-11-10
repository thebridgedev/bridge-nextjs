# Add billing to your app

**Step 3 of 3.** With [Stripe connected](/billing/setup/connect-stripe/) and your
[plans defined](/billing/setup/define-plans/), you can now use billing inside your
app. You can detect a first-time user and show them your plans, give users a
subscription page to upgrade or downgrade, and surface billing statuses, like a
payment that didn't go through. This page briefly covers each capability and links
out where we go deeper.

## Prerequisite: auth + bootstrap

Billing rides on the same setup as auth. Before anything here works you need
Bridge auth configured and `<BridgeProvider>` mounted in your root layout.
See [Authentication](/auth/) if you haven't done that yet, and
[How billing works](/billing/how-it-works/) for the model.

## Billing state is already live, with no init call

Once `<BridgeProvider>` mounts in your root `app/layout.tsx`, billing is **already live**. The provider fetches
the subscription for the current workspace (called a *tenant* in the API),
and honors your configured billing routes.
There is **no separate billing init call**.

State lands on the unified `bridge` object and updates over the live channel
(a persistent realtime connection the SDK maintains):

```tsx
'use client';
import { bridge, useBridgeReadable } from '@nebulr-group/bridge-nextjs/client';

export function PlanLine() {
  const subscription = useBridgeReadable(bridge.tenant.subscription);            // plan, status, trial
  const entitlements = useBridgeReadable(bridge.tenant.entitlements.snapshot);   // what the plan grants

  if (!subscription) return null;
  return (
    <p>Plan: {subscription.plan.name} ({subscription.status})</p>
  );
}
```

## One file serves the subscription pages

Create one page and Bridge serves the subscription page, the paywall and the checkout error page from it:

```tsx
// app/subscription/[[...bridge]]/page.tsx
import { BridgeBillingRoutes } from '@nebulr-group/bridge-nextjs/client';

export default function SubscriptionPage() {
  return <BridgeBillingRoutes />;
}
```

The double brackets make the catch-all optional, so the bare `/subscription` matches too. It serves:

| Address | Page |
|---|---|
| `/subscription` | the current plan with its renewal date and card, the plan picker and "Manage billing". A completed checkout lands here, with a confirmation banner |
| `/subscription/plan` | the paywall: where a signed-in workspace with no plan is sent |
| `/subscription/success` | a separate confirmation page, for apps that set `billing.successRoute` to it |
| `/subscription/error` | where a failed checkout confirmation lands |

Those are the defaults of `billing.manageRoute`, `billing.successRoute`, `billing.paywallRoute` and `billing.paymentErrorRoute`, so every Upgrade button, redirect and checkout return points at a page that exists. Nothing to configure.

- **The paywall redirect** sends a signed-in workspace with no plan (called a *tenant* in the API) to `/subscription/plan`, only when the app has plans and its `paymentsAutoRedirect` setting is on (the default). `billing: { paywallRoute: false }` turns it off, for an app that gates with the `<BridgePaywall>` overlay instead.
- **Your own onboarding page**, e.g. `/welcome`: render `<BridgePaywallPage />` there and point `billing.paywallRoute` at it:

```tsx
// app/welcome/page.tsx
import { BridgePaywallPage } from '@nebulr-group/bridge-nextjs/client';

export default function Welcome() {
  return <BridgePaywallPage heading="Pick a plan to get started" />;
}

// app/layout.tsx
<BridgeProvider config={{ billing: { paywallRoute: '/welcome' } }}>{children}</BridgeProvider>
```

- **Customising:** `--bridge-*` CSS tokens restyle the pages; `frame(page, children)` and `heading(page)` render-props on `<BridgeBillingRoutes>` replace the frame and each heading (pass them from a `'use client'` page file, since they are functions); to own one page outright, create it (`app/subscription/plan/page.tsx`) and Next.js prefers it over the catch-all.

### Where a checkout lands

After a paid checkout, or a Free plan pick, the user comes back to the
subscription page, which shows a "You're on Pro now" banner. There is no
separate confirmation step. To send them somewhere else, set
`billing.successRoute`:

```tsx
// app/layout.tsx
<BridgeProvider config={{ billing: { successRoute: '/dashboard' } }}>{children}</BridgeProvider>
```

To show the same banner there, put `<BridgeCheckoutNotice />` on that page or
in your layout. It renders nothing until a checkout has just completed, shows
once, and is gone after a reload. For a message of your own, read
`useCheckoutResult()` instead:

```tsx
'use client';
import { clearCheckoutResult, useCheckoutResult } from '@nebulr-group/bridge-nextjs/client';

export function ThanksForUpgrading() {
  const result = useCheckoutResult();
  if (!result) return null;
  return (
    <p>
      Thanks for upgrading! <button onClick={clearCheckoutResult}>OK</button>
    </p>
  );
}
```

`result.kind` is `'checkout'` after a paid checkout and `'plan'` after a Free
pick. The old confirmation page is still served: `successRoute:
'/subscription/success'` brings it back.

## Adding billing to your UI

**Surface billing health**: `<BridgeBillingNotice />` renders nothing while the subscription is healthy and the right banner (trial ending, payment failed, canceled) when it needs attention. Put it once in your root layout, inside `<BridgeProvider>`:

```tsx
// app/layout.tsx
<BridgeProvider>
  <BridgeBillingNotice />
  {children}
</BridgeProvider>
```

→ [Warn about billing problems](/billing/status/billing-notices/)

**Plan limits**: a backend that refuses at the cap (`402 QUOTA_EXCEEDED`, bridge-nestjs `@RequireQuota`) opens an upgrade dialog with no code on the page, as long as the call goes through `bridgeFetch()` or a plain `fetch` to your own origin. See [How Bridge works](../../mechanisms.md) for the three levels.

→ [Usage limits](/billing/limits/usage-limits/)

> That's the whole quickstart. From here, the rest of the billing section covers
> depth: [subscription status](/billing/status/subscription-status/),
> [usage limits](/billing/limits/usage-limits/),
> [free trials](/billing/lifecycle/free-trials/),
> [the billing portal](/billing/lifecycle/billing-portal/), and
> [failed-payment handling](/billing/lifecycle/failed-payments/), each building
> on the live `bridge` object you now have wired up.
