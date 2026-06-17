# Payments

In-app plan selection and Stripe Checkout via `@nebulr-group/bridge-nextjs`.

There are two ways to consume billing state:

1. **The `useBridge()` billing surface + drop-in components** (recommended) — live, reactive, zero wiring. See [Billing 2.0](#billing-20--live-reactive-billing-ui) below.
2. **The classic `<PlanSelector>` + `useSubscription()` store** — the original checkout flow. Still fully supported; covered first below.

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

---

## Billing 2.0 — live, reactive billing UI

Bridge gives every workspace one canonical subscription — a plan, a status, and an optional trial — kept live in your app over the Bridge live channel. When a payment fails, a trial nears its end, or an admin changes the plan in Stripe, your UI reflects it within seconds, without polling.

These components are backed by auth-core's reactive billing surface and are wired automatically by `<BridgeProvider>` — drop them in, no extra setup. They coexist with the classic `<PlanSelector>` above.

### Drop-in components

#### `<BridgeSubscriptionStatus />`

Renders the current plan name + a status badge. Mounts and subscribes itself — no props required.

```tsx
'use client';
import { BridgeSubscriptionStatus } from '@nebulr-group/bridge-nextjs/client';

export function Header() {
  return <BridgeSubscriptionStatus />;
}
```

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `className` | `string` | `''` | Class applied to the root span |

#### `<BridgeBillingNotice />`

The unified billing banner. Renders **nothing** while the subscription is healthy, and the right notice when it needs attention — trial countdown, payment failed, dunning retries, cancellation, locked. Not dismissible; it disappears when the status flips back to healthy.

```tsx
'use client';
import { BridgeBillingNotice } from '@nebulr-group/bridge-nextjs/client';

// Put it once in your root layout (inside <BridgeProvider>).
<BridgeBillingNotice />
```

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `chassis` | `'bar' \| 'rail' \| 'card'` | `'rail'` | Visual variant |
| `mode` | `'soft' \| 'hard'` | `'soft'` | `soft` always renders inline; `hard` renders a full-screen lockscreen when the workspace is billing-locked |
| `className` | `string` | `''` | Class applied to the root element |
| `onActionClick` | `(state) => void` | — | Override the default CTA click handler |

States it covers: trial active, trial ending soon, past due, cancellation scheduled, canceled, dunning retry scheduled, final retry, exhausted (locked). Each state has two role variants: admins get an action CTA ("Update card", "Upgrade"); members get an informational variant pointing them to their workspace owner.

#### `<BridgeQuotaBanner />`

A live usage-cap banner for one metric. Renders nothing while usage is below 80% of the plan's quota (or when the plan has no quota for that metric); shows a warning at 80–94%, critical at 95%+, and over-cap copy when the limit is exceeded. Updates live on `quota.updated` pushes.

```tsx
'use client';
import { BridgeQuotaBanner } from '@nebulr-group/bridge-nextjs/client';

<BridgeQuotaBanner metric="ai_completions" />
```

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `metric` | `string` | required | Metric key to watch |
| `label` | `string` | metric key | Humanized display label |
| `className` | `string` | `''` | Class applied to the root element |
| `onActionClick` | `(snap) => void` | — | Override the default Upgrade CTA handler |

For a fully custom quota UI, read the underlying snapshot directly via the auth-core billing surface (re-exported as `useBridgeBilling` to avoid colliding with the unified `useBridge`):

```tsx
import { useBridgeBilling } from '@nebulr-group/bridge-nextjs/client';

const q = useBridgeBilling().quota('ai_completions');
// q?.used, q?.limit, q?.remaining, q?.warningLevel ('approaching' | 'critical' | null)
```

#### `<BridgePaywall />`

A hard gate for workspaces that haven't picked a plan yet. While `shouldSelectPlan` is true it renders a full-screen modal with a `<PlanSelector>` inside; otherwise it renders its children.

```tsx
'use client';
import { BridgePaywall } from '@nebulr-group/bridge-nextjs/client';

<BridgePaywall successRedirect="/" cancelRedirect="/">
  {/* your app — only rendered once a plan is active */}
  {children}
</BridgePaywall>
```

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `successRedirect` | `string` | `'/'` | Where to send the user after a successful Stripe payment |
| `cancelRedirect` | `string` | `'/'` | Where to send the user if they cancel checkout |
| `onSelect` | `({ plan, price }) => void` | — | Called after free-plan selection or a direct plan change |
| `heading` | `ReactNode` | "Choose a plan" | Override the modal heading |

Workspaces with `paymentsAutoRedirect: false` are exempt from the gate. `successRedirect` / `cancelRedirect` are resolved against `window.location.origin` and handed to the inner `<PlanSelector>` as `successUrl` / `cancelUrl`.

### Entitlements

Plans grant **entitlements** — named capabilities like `ai_completions` or `sso`. They arrive with the session snapshot and update live on every `entitlements.changed` push, so an upgrade unlocks features without a reload.

```tsx
import { useBridgeBilling } from '@nebulr-group/bridge-nextjs/client';

// Imperative check (synchronous, fail-closed — false until the snapshot lands)
if (useBridgeBilling().entitlements.can('ai_completions')) { /* ... */ }
```

> Entitlements are **billing-derived** (what the plan grants the workspace). They are not roles — use Bridge's role/privilege system for who-may-do-what inside a workspace. The recommended gating pattern is a feature flag targeting `bridge:billing.entitlement.<key>`, not a raw conditional — see the Feature Flags guide.

### Billing events

For side effects — analytics, audit logs, Slack alerts — register handlers on the billing surface. This is separate from UI rendering, which the components above own:

```tsx
import { useBridgeBilling } from '@nebulr-group/bridge-nextjs/client';

const unsubscribe = useBridgeBilling().handle({
  'subscription.plan_changed': (m) => analytics.track('plan_changed', m),
  'payment.failed':            (m) => alertOps('payment failed'),
  'quota.updated':             (m) => updateMeter(m.metric, m.remaining),
  'entitlements.changed':      (m) => analytics.track('entitlements', m),
});
```

Multiple handlers can register for the same kind; one throwing handler never blocks the others.

### Environment variables

The components need no env vars of their own — they read live state through `<BridgeProvider>`, which is configured by `NEXT_PUBLIC_BRIDGE_APP_ID` (the same var the rest of the SDK uses).
