# Bridge Next.js — Billing 2.0 Runtime Prompt  *(Step 2 of 2 — make your app react to billing state)*

You are adding the **Billing 2.0 runtime layer** to a Next.js 15+ App Router project using **`@nebulr-group/bridge-nextjs`**.

After step 1 (`payments-prompt.md`), the app can accept money — plans exist in the admin, `/subscription` works, Stripe Checkout works. This prompt wires up the runtime layer that makes the app **aware** of who's on what plan, how much of their quota they've used, which features they're entitled to, and what's happening in their billing lifecycle.

You will add:

- **Subscription state reads** — `useSubscription()` (Phase 1.0 status shape) and `useBridge().subscription` (Billing 2.0 lifecycle snapshot)
- **Live quota counters** — composed from `useBridge().quota("metric")` + `useEffect` / `useState`
- **Entitlement checks** — `useBridge().entitlements.can("key")` flips reactively
- **Usage reporting** — `getBridgeAuth().usage.report(metric, n)`, fire-and-forget, durable queue
- **Lifecycle event subscriptions** — `useBridge().handle({ "payment.failed": fn, ... })`

**Important: bridge-nextjs does not yet ship the drop-in Billing 2.0 UI components** that bridge-svelte has (`<BridgeBillingNotice />`, `<BridgeQuotaBanner />`, `<BridgeSubscriptionStatus />`). The hook surface is fully there; this prompt walks through composing equivalent UI from `useBridge()` reads. The Bridge team will port the components in a follow-up; this prompt will gain them as drop-ins when they land.

## Prerequisites

- `payments-prompt.md` is complete — at least one plan exists in the admin, `/subscription` works.
- `BridgeProvider` is mounted at the root of the App Router tree (handled by the integration prompt).
- `@nebulr-group/bridge-nextjs` and `@nebulr-group/bridge-auth-core` are installed at a version that ships the Billing 2.0 surface (`useBridge`, `QuotaSnapshot`, lifecycle messages). If imports below fail, bump both packages and re-run `npm install`.

`useBridge` is imported from **`@nebulr-group/bridge-auth-core`**, not from `bridge-nextjs/client`. The accessor is framework-agnostic.

If payments isn't set up yet, run `payments-prompt.md` first. The runtime layer is meaningless without a plan to be on.

## Define quotas and entitlements per plan in the admin

Quotas (e.g. "100 AI completions per month") and entitlements (e.g. "advanced analytics enabled") are attached to plans in the admin, **not in code**. Pause and have the developer do this first:

> Open the Bridge admin → **Plans → [plan name]** and configure for each metered resource:
>
> - **Quotas** per metric (e.g. `ai_completions`): a limit per billing period + a policy — `metered` (bills overage via Stripe metered price) or `hard` (entitlement flips off at cap)
> - **Entitlements** per feature key (e.g. `advanced_analytics`): on/off per plan

**Do not generate code below until the developer confirms at least one quota or entitlement exists.** `useBridge().quota(metric)` returns `undefined` and `entitlements.can(key)` returns `false` for unconfigured keys — the integration can't be verified.

The dev never hard-codes metric names or entitlement keys — the admin owns them.

## The model — snapshots vs events

| Layer | Question | API |
|-------|----------|-----|
| **Snapshot accessors** | "What's true *right now*?" | `useBridge().subscription`, `.quota(metric)`, `.entitlements` |
| **Lifecycle handlers** | "What just *happened*?" | `useBridge().handle({ ... })` |

Use **snapshots** to render state. Use **events** for one-off side effects on a transition (toasts, analytics, emails). Snapshots always converge after disconnect; events can be missed — never rely on an event for state.

## Helper hooks — wrap useBridge once

`useBridge()` returns a memoized singleton — it's a plain accessor, not a React hook (the `use` prefix matches the Bridge convention but it does not subscribe React to anything). To make it reactive in components, wrap each accessor once and reuse:

```ts
// src/lib/bridge-hooks.ts
'use client';
import { useEffect, useState } from 'react';
import {
  useBridge,
  type BillingSubscriptionSnapshot,
  type QuotaSnapshot,
  type EntitlementSnapshot,
} from '@nebulr-group/bridge-auth-core';

export function useBridgeSubscription(): BillingSubscriptionSnapshot | null {
  const [snap, setSnap] = useState<BillingSubscriptionSnapshot | null>(null);
  useEffect(() => useBridge().subscription.subscribe(setSnap), []);
  return snap;
}

export function useBridgeQuota(metric: string): QuotaSnapshot | undefined {
  const [snap, setSnap] = useState<QuotaSnapshot | undefined>(undefined);
  useEffect(() => {
    const bridge = useBridge();
    setSnap(bridge.quota(metric));
    return bridge.quotas.subscribe((m) => {
      if (m === metric) setSnap(bridge.quota(metric));
    });
  }, [metric]);
  return snap;
}

export function useBridgeEntitlement(key: string): boolean {
  const [can, setCan] = useState(false);
  useEffect(() => {
    const bridge = useBridge();
    setCan(bridge.entitlements.can(key));
    return bridge.entitlementsStore.subscribe(() => setCan(bridge.entitlements.can(key)));
  }, [key]);
  return can;
}

export function useBridgeEntitlements(): EntitlementSnapshot {
  const [all, setAll] = useState<EntitlementSnapshot>({});
  useEffect(() => {
    const bridge = useBridge();
    setAll(bridge.entitlements.all());
    return bridge.entitlementsStore.subscribe(setAll);
  }, []);
  return all;
}
```

These four hooks are the canonical Next.js integration pattern. Generate this file once; reuse across the app.

## Reading subscription state

```tsx
'use client';
import { useBridgeSubscription } from '@/lib/bridge-hooks';

export function PlanBadge() {
  const sub = useBridgeSubscription();
  return <span>Plan: {sub?.plan?.name ?? '—'}</span>;
}
```

```tsx
'use client';
import { useBridgeSubscription } from '@/lib/bridge-hooks';

export function PastDueBanner() {
  const sub = useBridgeSubscription();
  if (sub?.status !== 'past_due') return null;
  return (
    <div className="banner banner-error">
      Payment failed. <a href={sub.recoveryUrl ?? '/billing/portal'}>Update billing</a>
    </div>
  );
}
```

**Snapshot fields** (`BillingSubscriptionSnapshot`):

| Field | Type | Meaning |
|-------|------|---------|
| `plan` | `BillingPlanRef` | Active plan reference |
| `status` | `'active' \| 'trial_active' \| 'cancel_at_period_end' \| 'past_due' \| 'canceled' \| ...` | Lifecycle state |
| `pastDueReason` | `PastDueReason \| undefined` | When `status === 'past_due'` |
| `daysLeft` | `number \| undefined` | Days left in trial or until dunning final retry |
| `endsAt`, `renewsAt`, `nextRetryAt`, `finalRetryAt` | `string \| undefined` | Lifecycle boundary ISO timestamps |
| `cardLast4`, `hasCardOnFile` | `string` / `boolean` | For "update payment method" CTAs |
| `gateEngaged` | `boolean` | Workspace locked due to billing |
| `recoveryUrl` | `string \| undefined` | Direct link to resolve current state |

For the Phase 1.0 status shape (`paymentsEnabled`, `shouldSelectPlan`, `trial`), the existing `useSubscription()` hook from `bridge-nextjs/client` still works — use whichever fits the call site.

## Live quota counters

```tsx
'use client';
import { useBridgeQuota } from '@/lib/bridge-hooks';

export function AICounter() {
  const snap = useBridgeQuota('ai_completions');
  if (!snap) return null; // no quota configured for this plan

  return (
    <div>
      <p>{snap.used} / {snap.limit} {snap.label} ({snap.percent_used}%)</p>
      {snap.warningLevel === 'approaching' && (
        <p className="warning">Approaching limit — {snap.remaining} left.</p>
      )}
      {snap.warningLevel === 'critical' && (
        <p className="critical">Critical — {snap.remaining} left.</p>
      )}
    </div>
  );
}
```

**`QuotaSnapshot` shape:**

| Field | Type | Meaning |
|-------|------|---------|
| `metric` | `string` | Metric key from admin |
| `used` / `limit` / `remaining` | `number` | Current period totals |
| `percent_used` | `number` | Rounded percentage |
| `warningLevel` | `null \| 'approaching' \| 'critical'` | `null` < 80%, `approaching` 80–94%, `critical` ≥ 95% |
| `policy` | `'hard' \| 'metered'` | From admin: `metered` bills overage, `hard` flips entitlement off at cap |
| `label` | `string` | Human label for the metric |

Returns `undefined` if no quota is configured — render nothing.

The counter ticks live as usage is reported. No polling.

## Reporting usage from your app

```ts
// Anywhere — client component, Server Action, route handler, background job.
import { getBridgeAuth } from '@nebulr-group/bridge-nextjs/client';

export async function generateCompletion(prompt: string) {
  const result = await callOpenAI(prompt);

  // Fire-and-forget. SDK queues durably; survives crashes / offline.
  getBridgeAuth().usage.report('ai_completions', 1);

  return result;
}
```

**Signature:**

```ts
usage.report(metric: string, value?: number, idempotencyKey?: string): void
```

- `value` defaults to `1`. Pass a positive integer for multi-unit events.
- `idempotencyKey` is auto-generated at enqueue. Only pass one when reconciling against an external system's ID.
- Do not `await` — synchronous-return, fire-and-forget. The SDK handles batching, retries, dedup.
- Reporting to a metric not configured in admin is accepted server-side but doesn't tick any counter.

**Inspecting the queue (debug only):**

```ts
const status = await getBridgeAuth().usage.getQueueStatus();
// { queueDepth, retryCount, lastFlushTimestamp, lastFlushError }
```

**Cap-vs-policy behavior:** reporting usage that exceeds the cap **always succeeds server-side**. The decision is downstream — `metered` bills overage, `hard` flips the entitlement off. React via the entitlement check, not by refusing to call `report`.

## Gating features by entitlement

```tsx
'use client';
import { useBridgeEntitlement } from '@/lib/bridge-hooks';

export function AnalyticsLink() {
  const canAnalytics = useBridgeEntitlement('advanced_analytics');
  if (!canAnalytics) return <p>Upgrade to Pro to access advanced analytics.</p>;
  return <a href="/analytics">Open advanced analytics</a>;
}
```

`useBridgeEntitlement` re-renders the moment the entitlement flips (plan change, quota exhaustion on a `hard` metric, payment failure). It returns `false` until hydration completes (fail-closed).

**Decision — entitlement vs feature flag:**

| Decision driver | Use |
|---|---|
| "This feature belongs to a paid plan" | **Entitlement** (`useBridgeEntitlement(...)`) |
| "I'm A/B-testing this with 10% of users" | **Feature flag** (`useFeatureFlag(...)`) |
| "Plan-X-only AND 10% rollout" | **Both** — entitlement says "allowed", flag says "exposed" |

Entitlements describe what the user *bought*; flags describe what's *exposed*.

## Subscribing to lifecycle events

For transient cross-cutting reactions — toasts, analytics, emails. Mount once in a side-effect-only component at the root layout.

```tsx
'use client';
import { useEffect } from 'react';
import { useBridge } from '@nebulr-group/bridge-auth-core';

export function BillingEventListeners() {
  useEffect(() =>
    useBridge().handle({
      'payment.failed': (m) => {
        toast.error(`Payment failed. Next retry: ${m.nextRetryAt}`);
      },
      'payment.succeeded': () => {
        toast.success('Payment received — thanks!');
      },
      'subscription.created': (m) => {
        analytics.track('subscription_created', { plan: m.plan?.key });
      },
      'cancel.scheduled': (m) => {
        analytics.track('cancel_scheduled', { endsAt: m.endsAt });
      },
      'quota.updated': (m) => {
        if (m.warningLevel === 'critical') {
          toast.warning(`${m.metric} at ${m.used}/${m.limit}`);
        }
      },
      'entitlements.changed': (m) => {
        console.log('entitlements changed', m.entitlements);
      },
    })
  , []);

  return null;
}
```

`handle(...)` returns a single unsubscribe function that detaches *all* registered handlers — return it directly from the `useEffect` cleanup.

Mount the component once in your root layout:

```tsx
// app/layout.tsx
import { BillingEventListeners } from './billing-event-listeners';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>
        <BillingEventListeners />
        {children}
      </body>
    </html>
  );
}
```

**Lifecycle message `kind` values** (subset — full list in `BillingLifecycleMessage`):

| `kind` | When it fires |
|--------|---------------|
| `payment.failed` | Stripe invoice failed; dunning starts |
| `payment.succeeded` | Invoice paid |
| `subscription.created` | Workspace moved onto a plan |
| `subscription.changed` | Plan or pricing changed |
| `cancel.scheduled` | User cancelled; still active until period end |
| `cancel.effective` | Cancellation took effect at period boundary |
| `dunning.advanced` | Dunning escalation step |
| `dunning.exhausted` | Retries exhausted; gate engages |
| `quota.updated` | Throttled counter push |
| `entitlements.changed` | One or more entitlements flipped |

Events can be missed across SDK reconnects. Use them for ephemeral side effects only.

## Reconnection behavior

The Bridge live channel reconnects automatically. On reconnect:

- **Snapshots converge.** All `useBridge*` hooks refetch and re-render. Even after a 6-hour offline window, state catches up within a couple seconds.
- **Events may be missed.** Anything fired while offline does not replay through `handle(...)`. The snapshot reflects the end state, but the transition itself is lost.
- **Usage queue drains.** `usage.report(...)` calls made offline are persisted (IndexedDB in browser; JSONL on Node servers) and replayed in order on reconnect, with server-side dedup preventing double-counts.

If you need to *react* to a transition, use both a `handle(...)` callback *and* a snapshot check on reconnect.

## Gate state (advanced)

If a workspace gets locked due to dunning, `useBridge().isLocked()` returns `true` and `useBridge().gateState()` returns the structured payload. Pattern for short-circuiting your app's normal UI:

```tsx
'use client';
import { useEffect, useState } from 'react';
import { useBridge } from '@nebulr-group/bridge-auth-core';

function useIsLocked(): boolean {
  const [locked, setLocked] = useState(false);
  useEffect(() => {
    const bridge = useBridge();
    setLocked(bridge.isLocked());
    return bridge.subscription.subscribe(() => setLocked(bridge.isLocked()));
  }, []);
  return locked;
}

export function GateGuard({ children }: { children: React.ReactNode }) {
  const locked = useIsLocked();
  if (locked) return <LockedScreen />;
  return <>{children}</>;
}
```

Or call `useBridge().assertNotLocked()` from Server Actions to fail fast.

## Integration checklist

- [ ] `src/lib/bridge-hooks.ts` exports `useBridgeSubscription`, `useBridgeQuota`, `useBridgeEntitlement`, `useBridgeEntitlements`.
- [ ] `BillingEventListeners` component is mounted once at `app/layout.tsx`.
- [ ] Any client component needing subscription state imports `useBridgeSubscription` (Phase 2.0 shape) or `useSubscription` from `bridge-nextjs/client` (Phase 1.0 shape).
- [ ] Usage is reported via `getBridgeAuth().usage.report(metric, value)`.
- [ ] Feature gates use `useBridgeEntitlement(key)`, not hard-coded plan checks.

## Verify

1. **Subscription snapshot reads correctly.** Add a client component using `useBridgeSubscription()`. Confirm the right plan name and status render.
2. **Quota counter is live.** Configure a quota in admin → drop `<AICounter />` (using `useBridgeQuota`) → call `getBridgeAuth().usage.report('<metric>')` from a button → counter ticks up. Cross 80% → `warningLevel` flips to `approaching`.
3. **Entitlement gate works.** Wrap a feature with `useBridgeEntitlement(key)`. Toggle the entitlement in admin — gated UI disappears without a manual refresh.
4. **Past-due UI renders.** Trigger past_due via Stripe test card or admin override → your `PastDueBanner` (or equivalent) renders.
5. **Lifecycle handler fires.** Register `'subscription.changed'` in `useBridge().handle({...})` and switch plans via `<PlanSelector />`. Confirm the handler runs.
6. **Usage queue drains.** DevTools → Application → IndexedDB → confirm the Bridge usage store. Fire `usage.report(...)` offline, come back online, watch queue depth go to 0 via `getBridgeAuth().usage.getQueueStatus()`.
7. **Run `npm run build`** to confirm no TypeScript or import errors.

If any verification step fails on an undefined export, the SDK version is too old — bump `@nebulr-group/bridge-nextjs` and `@nebulr-group/bridge-auth-core`, then re-run `npm install`.
