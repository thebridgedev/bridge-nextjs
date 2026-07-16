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

## Configure your billing routes

Add a `billing` block to the `BridgeConfig` you already pass to `<BridgeProvider>`
in `app/providers.tsx`:

```tsx
// app/providers.tsx
'use client';
import { BridgeProvider } from '@nebulr-group/bridge-nextjs/client';
import { useMemo, type ReactNode } from 'react';

export function Providers({ children }: { children: ReactNode }) {
  // appId comes from NEXT_PUBLIC_BRIDGE_APP_ID via the provider's env reader
  const config = useMemo(
    () => ({
      loginRoute: '/auth/login',
      billing: {
        paywallRoute: '/subscription', // send plan-less workspaces here
      },
    }),
    [],
  );

  return <BridgeProvider config={config}>{children}</BridgeProvider>;
}

// app/layout.tsx
import { Providers } from './providers';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

> **Framework note:** define the config object in a client component, not as an
> inline object prop in the Server Component root layout. Nested runtime config
> like `billing` is brittle across the Server to Client boundary, and memoizing
> the object keeps its identity stable across renders.

- **`paywallRoute`**: when set, the provider redirects an authenticated workspace
  that hasn't selected a plan here. Point it at
  wherever your `<PlanSelector>` lives. (Workspaces that opt out via
  `paymentsAutoRedirect: false` are exempt.)

It's optional. Leave `paywallRoute` unset if you'd rather gate the app with
`<BridgePaywall>` (below) than redirect.

## Adding billing to your UI

Here are three use cases for billing in your UI:

**1. Letting users select a plan after first signup**: wrap your root layout in
`<BridgePaywall>`; it blocks the app and shows a plan picker until the workspace
has an active plan, so a brand-new user picks a plan before they get in:

```tsx
// app/layout.tsx
import { BridgePaywall } from '@nebulr-group/bridge-nextjs/client';
import { Providers } from './providers';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <BridgePaywall successRedirect="/welcome" cancelRedirect="/subscription">
            {/* your app: only rendered once a plan is active */}
            {children}
          </BridgePaywall>
        </Providers>
      </body>
    </html>
  );
}
```

→ [Require a plan to use the app](/billing/onboarding/require-plan/)

**2. A self-service subscription page**: drop `<PlanSelector />` onto a route. It
loads all the plans so your users can upgrade or downgrade directly from your app:

```tsx
// app/subscription/page.tsx
'use client';
import { PlanSelector } from '@nebulr-group/bridge-nextjs/client';

export default function SubscriptionPage() {
  return <PlanSelector successUrl="/subscription/success" cancelUrl="/subscription" />;
}
```

→ [Choose & switch plans](/billing/onboarding/choose-switch-plans/)

**3. Surface billing health**: `<BridgeBillingNotice />` renders nothing while
the subscription is healthy and the right banner (trial ending, payment failed,
canceled) when it needs attention. Put it once in your root layout:

```tsx
'use client';
import { BridgeBillingNotice } from '@nebulr-group/bridge-nextjs/client';

export function BillingBanner() {
  return <BridgeBillingNotice />;
}
```

→ [Warn about billing problems](/billing/status/billing-notices/)

> That's the whole quickstart. From here, the rest of the billing section covers
> depth: [subscription status](/billing/status/subscription-status/),
> [usage limits](/billing/limits/usage-limits/),
> [free trials](/billing/lifecycle/free-trials/),
> [the billing portal](/billing/lifecycle/billing-portal/), and
> [failed-payment handling](/billing/lifecycle/failed-payments/), each building
> on the live `bridge` object you now have wired up.
