# Require a plan to use the app

Some apps shouldn't do anything until the workspace (called a *tenant* in the API) is on a plan. "Requiring a plan" means blocking the app until the current workspace has an **active plan**, and letting it through the moment one exists.

A plan counts as active once the workspace has either:

- **selected a free plan** (instant, no payment involved), or
- **completed Stripe Checkout for a paid plan** (a payment method is captured).

Under the hood the gate keys off a single flag on the subscription status: **`shouldSelectPlan`**. While it's `true` the workspace has no active plan and the app should stay blocked; once a plan is selected or checked out it flips to `false` and the app opens up. You never compute this yourself; Bridge derives it from the workspace's billing state. (This is the onboarding gate. A workspace that *had* a plan and lost it, say after exhausted payment retries, is **billing-locked** instead, which is a separate signal. See [How billing works](/billing/how-it-works/#when-billing-locks-the-app) for how the two relate.)

There are two ways to enforce the gate. With `app/subscription/[[...bridge]]/page.tsx` rendering `<BridgeBillingRoutes />` (see [Add billing to your app](/billing/setup/add-billing-to-your-app/)), the paywall redirect (Method 2) is already on: a plan-less workspace is sent to `/subscription/plan`. Use the `<BridgePaywall>` overlay (Method 1) instead when you would rather block the app in place.

## Method 1: `<BridgePaywall>` (recommended)

`<BridgePaywall>` is a hard gate you wrap around your app: it blocks everything until a plan is active, with no `shouldSelectPlan` checks or redirects to wire yourself. Put it in your root `app/layout.tsx`, pass your app as children, and turn the paywall redirect off (`billing: { paywallRoute: false }`) so the overlay is the only gate.

While `shouldSelectPlan` is true it renders a full-screen modal with a `<PlanSelector>` inside; otherwise it renders its children (your app).

```tsx
// app/layout.tsx
import { BridgePaywall, BridgeProvider } from '@nebulr-group/bridge-nextjs/client';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <BridgeProvider config={{ billing: { paywallRoute: false } }}>
          <BridgePaywall successRedirect="/welcome" cancelRedirect="/plans">
            {/* your app: only rendered once a plan is active */}
            {children}
          </BridgePaywall>
        </BridgeProvider>
      </body>
    </html>
  );
}
```

> **Tip:** Pass your app as `children`. `<BridgePaywall>` renders its children only when a plan is active, so nothing behind the gate mounts until then.

> **Framework note:** `<BridgePaywall>` is a client component, but the `children` you pass through from a server layout can still be Server Components; React carries them across the boundary as already-rendered trees.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `successRedirect` | `string` | `'/'` | Where to send the user after a successful Stripe payment |
| `cancelRedirect` | `string` | `'/'` | Where to send the user if they cancel checkout |
| `onSelect` | `({ plan, price }) => void` | (none) | Called after free-plan selection or a direct plan change (not the Stripe redirect path); use for analytics side-effects |
| `heading` | `ReactNode` | "Choose a plan" | Override the modal heading |
| `children` | `ReactNode` | (none) | Your app. Rendered only once a plan is active |

What the user sees: a workspace with no plan lands on a full-screen modal with the plan picker and cannot get past it. The instant they pick a plan (or return from checkout), the modal disappears and your app renders in its place.

## Method 2: the paywall redirect

Prefer this when you want the plan picker to be a **real routed page** rather than a modal overlay. With `<BridgeBillingRoutes>` in place it is already on, pointing at `/subscription/plan`. For a dedicated onboarding page at another address, render `<BridgePaywallPage>` there and point `billing.paywallRoute` at it:

```tsx
// app/plans/page.tsx
import { BridgePaywallPage } from '@nebulr-group/bridge-nextjs/client';

export default function PlansPage() {
  return <BridgePaywallPage heading="Pick a plan to get started" />;
}

// app/layout.tsx — a Server Component; the config is plain data
<BridgeProvider config={{ billing: { paywallRoute: '/plans' } }}>{children}</BridgeProvider>
```

A completed checkout lands on `/subscription/success`; a cancelled one comes back to `/plans`.

`<BridgeProvider>` handles the gate for you: it checks the subscription status, and if the authenticated workspace still needs to pick a plan it issues a redirect to `paywallRoute`. It only redirects when all of the following hold, so there's no redirect loop and no gate on exempt workspaces:

- `billing.paywallRoute` is not `false` (it defaults to `/subscription/plan`; the default applies only to an app that has plans)
- the current path isn't already the paywall route or the payment-error page
- the workspace is authenticated but has `shouldSelectPlan: true`
- the workspace hasn't opted out via `paymentsAutoRedirect: false`

> **Framework note:** the redirect runs client-side, after hydration, on every route change; it doesn't block Next.js server rendering. If a page must never reach the browser without a plan, enforce it on your backend too (see [Check plans on your backend](/billing/advanced/backend-checks/)).

> **Tip:** `<PlanSelector>` is the same picker `<BridgePaywall>` renders inside its modal. See [Choose & switch plans](/billing/onboarding/choose-switch-plans/) for its full prop table and customization options.

## The end-to-end flow

Both methods drive the same underlying flow:

1. A user signs in to a workspace that has **no active plan** → `shouldSelectPlan` is `true`.
2. The **gate** engages: the `<BridgePaywall>` modal appears, or `<BridgeProvider>` redirects to your `paywallRoute` page.
3. The user picks a plan from the `<PlanSelector>`:
   - **Free plan** → activated instantly, no payment. `onSelect` fires and the store refreshes.
   - **Paid plan** → the user is sent to **Stripe Checkout** to capture a payment method.
4. On successful payment the user returns to your app at **`successRedirect`**; if they cancel, they land on **`cancelRedirect`**.
5. With a plan now active, `shouldSelectPlan` flips to `false` → the **gate opens** and your app renders.

## Opting out: `paymentsAutoRedirect: false`

`paymentsAutoRedirect` is a flag on the subscription status. When it's `false`, the workspace **has opted out of the platform's native plan-selection gate**; such workspaces are exempt from the automatic block. Both methods above respect it: `<BridgePaywall>` renders its children instead of the modal, and `<BridgeProvider>` skips the paywall redirect entirely.

This exists so certain workspaces can bypass the forced plan choice, for example accounts provisioned or billed out-of-band, where forcing a plan selection in the app would be wrong. Those workspaces still reach your app normally; you're free to render your own `<PlanSelector>` where it makes sense, but the platform won't block them for you.

`successRedirect` and `cancelRedirect` are independent of this flag; they're simply where the user lands after leaving Stripe Checkout (success or cancel, respectively). They default to `'/'` on `<BridgePaywall>`.
