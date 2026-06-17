# Live Updates & the Bridge Surface

Every Bridge app holds one live channel to the platform. On connect (and on every reconnect) the server pushes a `session.snapshot` with everything your UI needs — branding, workspace, subscription, entitlements, user — and after that, targeted pushes keep it current: flag changes, plan changes, payment events, quota updates. No polling, no refresh.

The **`bridge` surface** is the single object that exposes all of it, grouped by scope. Read it from a client component via `useBridge()`:

```tsx
'use client';
import { useEffect, useState } from 'react';
import { useBridge, type UserSnapshot, type SubscriptionSnapshot } from '@nebulr-group/bridge-nextjs/client';

export function AccountHeader() {
  const bridge = useBridge();
  const [name, setName] = useState<string | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionSnapshot | null>(null);
  const [user, setUser] = useState<UserSnapshot | null>(null);

  useEffect(() => {
    const unsubs = [
      bridge.tenant.name.subscribe(setName),
      bridge.tenant.subscription.subscribe(setSubscription),
      bridge.user.subscribe(setUser),
    ];
    return () => unsubs.forEach((u) => u());
  }, [bridge]);

  return (
    <>
      <p>Workspace: {name}</p>
      <p>Plan: {subscription?.plan.name}</p>
      <p>Signed in as {user?.email}</p>
    </>
  );
}
```

Every slice is a subscribable readable: `subscribe(fn)` calls `fn` immediately with the current value and again on every change, returning an unsubscribe function. Slices are `null` until the channel delivers the first snapshot — gate on null for skeletons, or fall back to defaults. The `bridge` object's identity is stable; destructure and pass sub-references freely.

### The scopes

| Path | Type | What it holds |
|------|------|---------------|
| `bridge.app.branding` | readable of `BrandingSnapshot \| null` | Whitelabel branding: `logo`, `name`, colors, font |
| `bridge.app.plans` | lazy slice | Full plan catalog — `await bridge.app.plans` fetches on first access |
| `bridge.tenant.id` / `.name` | readable of `string \| null` | Current workspace identity |
| `bridge.tenant.subscription` | readable of `SubscriptionSnapshot \| null` | Canonical plan + status + endsAt (see the Payments guide) |
| `bridge.tenant.entitlements` | `snapshot` readable + `can(key)` | Plan-granted capabilities, replaced live on change |
| `bridge.user` | readable of `UserSnapshot \| null` | Authenticated user: `id`, `email`, `role`, `tenantId` |
| `bridge.attributes` | write surface | Publish your own attributes into flag targeting (below) |
| `bridge.events` | dispatcher | Subscribe to every live channel event (below) |

### Snapshots vs events

Two distinct layers ride the live channel, and they answer different questions:

| Layer | Question | API |
|-------|----------|-----|
| **Snapshot readables** | "What's true *right now*?" | `bridge.tenant.subscription`, `bridge.tenant.entitlements`, quota readables, … |
| **Event handlers** | "What just *happened*?" | `bridge.events.handle({ ... })` |

Use **snapshots** to render state — they always converge to the correct value after a disconnect. Use **events** for one-off side effects on a transition (toasts, analytics, emails). Events can be missed across a reconnect, so never derive durable UI state from an event alone.

### Handling live events

`bridge.events.handle({...})` is the one API for reacting to channel events — use it for side effects like analytics, audit logging, or alerting (UI state updates automatically through the readables above):

```ts
import { bridge } from '@nebulr-group/bridge-nextjs/client';

const unsubscribe = bridge.events.handle({
  'flag.updated':              (m) => console.log('flag changed:', m.flag.key),
  'subscription.plan_changed': (m) => analytics.track('plan_changed', m),
  'quota.updated':             (m) => updateMeter(m.metric, m.remaining),
  'session.snapshot':          (m) => analytics.track('hydrated'),
  '*':                         (m) => debugLog(m.kind, m),
});

// later — one call removes every handler registered above
unsubscribe();
```

Event kinds:

- **Flags:** `flag.updated`, `flag.removed`
- **Session:** `session.snapshot`, `user.state_changed`
- **Subscription:** `subscription.plan_changed`, `subscription.created` / `updated` / `canceled` / `reactivated`, `subscription.trial_started` / `trial_ending_soon` / `trial_converted` / `trial_expired`
- **Payments:** `payment.succeeded`, `payment.failed`, `dunning.entered` / `retry_scheduled` / `recovered` / `exhausted`
- **Quotas & entitlements:** `quota.updated`, `entitlements.changed`

Semantics worth knowing:

- **Multiple handlers per kind** — every registered handler fires; registering is additive across your app.
- **`'*'` is a fallback**, not a firehose: it fires only for kinds that have no specific handler registered (so you never double-handle).
- **Errors are isolated** — one throwing handler doesn't block the others or break the dispatch loop.

### Publishing your own attributes

`bridge.attributes` is the write surface for feeding your own data into feature-flag targeting. Keys you publish here are usable in flag rules immediately and win over Bridge-managed attributes on collision:

```ts
import { bridge } from '@nebulr-group/bridge-nextjs/client';

// Static value
bridge.attributes.set('beta_cohort', true);

// Live-bound — the getter re-runs on every flag evaluation
bridge.attributes.bind('cart_size', () => cart.items.length);

// Bulk — one getter returning a whole map
bridge.attributes.bindMany(() => ({
  theme: currentTheme,
  locale: navigator.language,
}));

// Read the merged map / remove keys
bridge.attributes.get();
bridge.attributes.unset('beta_cohort');
```

The `bridge:` namespace is reserved for Bridge-managed attributes — writes to it are rejected with a console warning. Pass `{ observed: false }` to `set`/`bind`/`bindMany` to keep a key out of attribute-discovery telemetry.

### Connection status

The channel's connection state is available as both a React hook and a subscribable readable:

```tsx
'use client';
import { useRealtimeStatus } from '@nebulr-group/bridge-nextjs/client';

export function ConnectionBadge() {
  const status = useRealtimeStatus();
  if (status === 'open') return null;
  return <span className="badge">reconnecting…</span>;
}
```

While the channel is down, everything keeps working from the last known state — flags evaluate from cache, readables hold their last snapshot. On reconnect the server re-sends a full `session.snapshot`, so every slice updates atomically and nothing is missed.

What this means in practice, even after a long offline window (say 6 hours):

- **Snapshots converge.** Every readable refetches and re-renders; state catches up within a couple of seconds.
- **Events may be missed.** Anything fired while offline does not replay through `handle(...)`. The snapshot reflects the end state, but the individual transition is lost — so if you need to *react* to a transition, pair a `handle(...)` callback with a snapshot check on reconnect.
- **Usage reports drain.** `getBridgeAuth().usage.report(...)` calls made offline are persisted (IndexedDB in the browser, JSONL on Node servers) and replayed in order on reconnect, with server-side dedup preventing double-counts.

### Relationship to the existing hooks

The `bridge` surface and the existing hooks (`useProfile`, `useSubscription`, `useAuthState`, …) are both supported and fed by the same internal state. The `bridge` surface is the newer, scoped way to read live platform state; the existing hooks remain the API for auth state and the classic checkout flow — see the Auth and Payments guides. Use whichever fits; they don't conflict.
