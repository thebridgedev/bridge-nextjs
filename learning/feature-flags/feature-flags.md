---
title: Feature Flags
order: 40
oneLiner: Ship behind a flag and change who sees what — live from admin, no redeploy.
related: [live-updates, payments]
---

# Feature Flags

Bridge Feature Flags evaluates locally — the SDK keeps the flag rules in memory, evaluates against in-process context, and receives rule changes live over a push channel. A flag check is an O(1) lookup: no network call, safe in render paths.

Next.js runs your app on two sides, and flags work on both:

- **Client Components** read flags reactively with `useFlag` / `<FeatureFlag>` — when an admin flips a flag, the value updates in place over the live channel, no refresh.
- **Server Components, middleware, and route handlers** evaluate the same flags server-side against the request's token claims — so protected pages and API routes never render before the flag decision is made.

Flags work standalone: an `appId` is all the configuration you need. Bridge auth and billing are optional context sources (see "Bridge-managed attributes" below).

Everything ships from one package with two subpath entries — client code imports from `@nebulr-group/bridge-nextjs/client`, server code from `@nebulr-group/bridge-nextjs/server`. There is no separate `/flags` entry; the flags surface is folded into `./client`.

### Setup

`<BridgeProvider>` bootstraps flags for you — mount it once in your root layout and the client cache, live updates, and telemetry are wired automatically:

```tsx
// app/layout.tsx
import { BridgeProvider } from '@nebulr-group/bridge-nextjs/client';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <BridgeProvider>{children}</BridgeProvider>
      </body>
    </html>
  );
}
```

No flag-specific init call is needed — the flag SDK reads `appId` + `apiBaseUrl` from the same BridgeAuth config `<BridgeProvider>` already uses (only `appId` is required for flags-only apps). Server-side evaluation reads the same config from the `NEXT_PUBLIC_BRIDGE_*` env vars.

### useFlag — reactive flag values (client)

```tsx
'use client';
import { useFlag } from '@nebulr-group/bridge-nextjs/client';

export function Banner() {
  const { value } = useFlag('show_banner', false);
  return value ? <div className="banner">New stuff!</div> : null;
}
```

`useFlag(key, defaultValue, context?)` returns `{ value, passed }`:

- **`value`** — the evaluated flag value, typed from your default (`boolean` | `string` | `number` | JSON object).
- **`passed`** — whether a rule branch matched.
- The result is **reactive**: when an admin changes the flag (or a live rule update arrives), the hook re-renders with the new `value`.
- The default is mandatory — it's what your app gets when the flag isn't configured or Bridge is unreachable. A flag call can never break your app.

`useFlag` is a React hook, so it only runs inside Client Components (`'use client'`).

### Per-call context

The optional third argument supplies per-call identity/attributes. Per-call attributes win over everything else on key collision:

```tsx
const checkout = useFlag('new_checkout', false, {
  attributes: { cart_size: cart.items.length },
});
```

Unlike bridge-svelte, the context is a plain object — React re-evaluates the hook on every render, so there's no getter function to keep it reactive.

### App-wide attributes (`bridge.attributes`)

For attributes that every flag evaluation should see — not just one call site — publish them once on the unified bridge surface:

```tsx
'use client';
import { bridge } from '@nebulr-group/bridge-nextjs/client';

bridge.attributes.set('beta_cohort', true);                    // static value
bridge.attributes.bind('cart_size', () => cart.items.length);  // re-read on every eval
bridge.attributes.bindMany(() => ({ theme, locale }));         // bulk getter
```

Precedence on key collision: per-call context > `bridge.attributes` > Bridge-managed providers. The `bridge:` namespace is reserved — writes to it are rejected with a console warning. See [Send context from your code](/feature-flags/targeting/send-context/) for the full pattern.

### FeatureFlag component (client)

Declarative gating with optional fallback content. `children` and `fallback` may each be a node or a render-prop that receives the evaluated value:

```tsx
'use client';
import { FeatureFlag } from '@nebulr-group/bridge-nextjs/client';

<FeatureFlag flagKey="new_dashboard" defaultValue={false}>
  <NewDashboard />
</FeatureFlag>

// With fallback for the non-matching case:
<FeatureFlag
  flagKey="premium_feature"
  defaultValue={false}
  fallback={<button disabled title="Upgrade to unlock">Premium (locked)</button>}
>
  <button>Use premium feature</button>
</FeatureFlag>
```

> **Tip:** React reserves the prop name `key` for reconciliation, so the flag key is passed as `flagKey`, not `key`.

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `flagKey` | `string` | **(required)** | The flag key (`key` is reserved by React) |
| `defaultValue` | `T` | **(required)** | Safe value; also sets the flag's inferred type |
| `context` | `Partial<EvalContext>` | — | Per-call eval context (attributes win on collision) |
| `children` | node \| `(value) => node` | — | Rendered when the flag passes |
| `fallback` | node \| `(value) => node` | — | Rendered when it doesn't |

### flagStore — subscribe outside React

For non-component code (or tests) that wants to observe a single flag without a hook:

```ts
import { flagStore } from '@nebulr-group/bridge-nextjs/client';

const banner = flagStore('show_banner', false);
const unsubscribe = banner.subscribe(({ value, passed }) => {
  // runs immediately and again on every live flag change
});
```

### Multi-type values

One API for boolean, string, number, and JSON flags — the type is inferred from the default:

```ts
const isDark = useFlag('dark_mode', false);
const cta    = useFlag('checkout_text', 'Submit');
const limit  = useFlag('max_uploads', 10);
const cfg    = useFlag('rate_limit', { window: 60, max: 100 });
```

A type mismatch (admin stored a different type than your default suggests) returns the default and logs a warning.

### Identity & anonymous visitors

The SDK manages identity for you:

- On first load in the browser, it generates an anonymous ID and persists it (configurable: `persistent` localStorage / `session` sessionStorage / `none` in-memory) — anonymous visitors get stable bucketing for A/B tests and percentage rollouts.
- With Bridge auth enabled, the session identity (the token's `sub`) is used automatically and pre-login activity links on login.

### Live connection status

```tsx
'use client';
import { useRealtimeStatus } from '@nebulr-group/bridge-nextjs/client';

const status = useRealtimeStatus(); // 'connecting' | 'open' | 'closed' …
```

When the live channel drops, flags freeze on last-known values and refetch on reconnect — your app keeps working through Bridge outages. Outside React, the same value is available on the `realtimeStatus` store's `.subscribe()`.

### Bridge-managed attributes

With Bridge auth and/or billing enabled, attributes like `user.role`, `tenant.plan`, and `bridge:billing.plan` merge into every evaluation automatically — no app code. Your own (dev-supplied) attributes always win on key collision, and the admin UI surfaces collisions on the flag detail page.

With billing enabled this includes quota and entitlement attributes (`bridge:billing.quota.<metric>.*`, `bridge:billing.entitlement.<name>`) — the recommended way to gate plan-granted features is a flag whose rule targets an entitlement attribute. See [Target by plan or role](/feature-flags/targeting/by-plan-or-role/) and the Payments guide's Entitlements section for the pattern.

### Server-side evaluation

Client hooks are for the browser. In a Server Component, middleware, or route handler, use the server surface instead — it evaluates the same flags against the request's token claims (read from cookies):

- `<ServerFeatureFlag>` — SSR-safe conditional rendering. See [Show or hide UI](/feature-flags/using/show-hide-ui/).
- `withFeatureFlags` in `middleware.ts` — guard whole page/API routes. See [Guard routes](/feature-flags/using/guard-routes/).
- `requireFeatureFlagForRoute` — wrap an API route handler. See [Use flags on your backend](/feature-flags/using/backend/).

### Propagating context to your backend

If a backend you control also evaluates flags for the same user, forward the eval context so both sides agree on identity and bucketing. The SDK serializes the context into the `x-bridge-context` header; backend SDKs (e.g. `@nebulr-group/bridge-nestjs/flags` with `BridgeContextInterceptor`) pick it up automatically. The Next.js middleware and route-handler wrappers set this header for you. See [Use flags on your backend](/feature-flags/using/backend/).

Only propagate identity and attributes the backend can't derive itself — never `role`/`plan`-style attributes (the backend reads those from its own verified sources).

### Under the hood

- **No network on read (client)** — `useFlag` / `<FeatureFlag>` evaluate against an in-memory rule cache (an O(1) lookup); there is no request per flag check, so they are safe in render paths.
- **Live rule updates** arrive over the realtime channel and update values in place — no refresh, no flicker.
- **Server pull-cache** — server-side evaluation reads flag rules through a short-lived pull cache (default 30s TTL) and evaluates locally per request; expect up to one TTL window of delay after toggling a flag before server-rendered output changes.
- **Telemetry** evaluations are batched and reported in the background, off the render path.

### Percentage rollout

Roll a feature out to a fraction of users instead of flipping it for everyone. In admin, give the flag a rule with a percentage (say 10%) — the SDK evaluates it against a **stable bucket** derived from the visitor's identity:

```tsx
'use client';
import { useFlag } from '@nebulr-group/bridge-nextjs/client';

// No code change for rollout — the percentage lives in the flag rule.
const newCheckout = useFlag('new_checkout', false);
```

- **Sticky buckets** — the same identity always lands in the same bucket, so a user who's in the 10% stays in as you ramp to 25%, 50%, 100%. No flicker, no re-rolling.
- **Anonymous visitors** get a persisted anonymous ID (see Identity above), so they bucket consistently before they ever sign in; on login, pre-login activity links to the authenticated identity.
- **A/B cohorts** — a multi-variant flag (string/number/JSON) splits traffic into buckets and returns the variant for each, giving you experiment arms with the same sticky guarantee.
- **Combine with rules** — a rollout can sit behind a segment (e.g. 10% *of users whose `tenant.plan = PRO`*), because the percentage applies after the rule's attribute conditions match.

> **Tip:** Server-side (backend mode) refuses to bucket a rolled-out rule (`rolloutPct < 100`) without identity — a request with no token gets the safe default, by design. Client evals always have an anonymous identity to bucket on.

Because the percentage and segments live in the flag rule, ramping a rollout or killing it is an admin action — your deployed code never changes.

### Route-level flags

Gate entire routes behind flags in `middleware.ts` with `withFeatureFlags` — evaluated server-side before the route renders, independent of the in-component `useFlag` / `<FeatureFlag>` surface. See [Guard routes](/feature-flags/using/guard-routes/).
