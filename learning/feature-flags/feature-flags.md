# Feature Flags

Conditional rendering and access control driven by Bridge Feature Flags 2.0.

Bridge evaluates flags **locally in the SDK** against a cache of flag rules that
syncs live from the Bridge API. On the client the cache rides the same realtime
channel as the rest of Bridge (auth, billing) — toggling a flag in the admin UI
updates your app without a refresh. On the server, flags evaluate in
backend-mode against the request's token claims.

## Define flags

Create flag definitions in the Bridge admin UI. Each flag has:
- A unique key (e.g. `beta-dashboard`).
- A state: `off`, `on`, or `on-with-rule`.
- For `on-with-rule`: a targeting rule (branches of conditions against
  attributes like `user.role`, `tenant.plan`, or dev-supplied attributes).

## Setup

Feature Flags 2.0 is bootstrapped automatically by `<BridgeProvider>` — no extra
wiring. Mount the provider once in your root layout (see the integration guide):

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

## Client-side: `<FeatureFlag>` component

```tsx
'use client';
import { FeatureFlag } from '@nebulr-group/bridge-nextjs/client';

// React reserves the prop name `key`, so the flag key is passed as `flagKey`.
<FeatureFlag flagKey="beta-dashboard" defaultValue={false} fallback={<p>Stable dashboard</p>}>
  <p>Beta dashboard preview</p>
</FeatureFlag>
```

`children` renders when the rule passes; `fallback` renders when the flag is off
or no rule matched. Both can be a render-prop that receives the Bridge-decided
value (useful for non-boolean flags):

```tsx
<FeatureFlag flagKey="ui-theme" defaultValue="light">
  {(value) => <App theme={value} />}
</FeatureFlag>
```

Pass `context` to evaluate against attributes your app supplies at call time —
these override server-side values for the same key:

```tsx
<FeatureFlag flagKey="plan-flag" defaultValue={false} context={{ attributes: { plan } }}>
  {() => <EnterpriseFeature />}
</FeatureFlag>
```

## Client-side: `useFlag` hook

```tsx
'use client';
import { useFlag } from '@nebulr-group/bridge-nextjs/client';

export function CTA() {
  const { value, passed } = useFlag('new-checkout', false);
  return passed ? <NewCheckout /> : <LegacyCheckout />;
}
```

`useFlag(key, defaultValue, context?)` returns `{ value, passed }` and re-renders
whenever the flag changes in the cache (live update, hydrate, login/logout). Pass
`context` for per-call attributes, same as the component:

```tsx
const { value } = useFlag('enterprise-feature', false, { attributes: { plan } });
```

## Dev-supplied attributes

Your app can declare attributes globally via the unified bridge surface so every
flag eval sees them, without threading `context` through each call:

```tsx
'use client';
import { bridge } from '@nebulr-group/bridge-nextjs/client';

bridge.attributes.set('plan', 'enterprise');
bridge.attributes.bindMany(() => ({ plan: currentPlan, region: currentRegion }));
```

Dev-supplied attributes win on key collision with Bridge-managed providers
(auth, billing). Per-call `context` attributes win over everything for that one
eval.

## Advanced: `createBridgeFlags`

`<BridgeProvider>` calls `createBridgeFlags()` for you. Call it directly only for
standalone-SDK use or tests where you need a second instance:

```tsx
import { createBridgeFlags } from '@nebulr-group/bridge-nextjs/client';

const { bridge, stop } = createBridgeFlags({ registerGlobal: false });
```

## Server-side: `<ServerFeatureFlag>`

For SSR-safe conditional rendering in server components. Evaluates in
backend-mode against the request's token claims (read from cookies):

```tsx
import { ServerFeatureFlag } from '@nebulr-group/bridge-nextjs/server';

export default function Page() {
  return (
    <ServerFeatureFlag flagName="beta-dashboard" fallback={<StableDashboard />}>
      <BetaDashboard />
    </ServerFeatureFlag>
  );
}
```

Supports `negate` and `redirectTo` for access control:

```tsx
<ServerFeatureFlag flagName="maintenance-mode" negate redirectTo="/">
  <NormalContent />
</ServerFeatureFlag>
```

## Server-side: middleware

Protect page and API routes by flag in `middleware.ts`:

```ts
import { withFeatureFlags } from '@nebulr-group/bridge-nextjs/server';

export const middleware = withFeatureFlags([
  { flag: 'beta-dashboard', paths: ['/beta', '/beta/*'], redirectTo: '/' },
  { flag: 'beta-api', paths: ['/api/beta/*'], responseType: 'error', errorStatus: 403 },
]);

export const config = { matcher: ['/beta/:path*', '/api/beta/:path*'] };
```

The middleware also serializes the eval context onto the `x-bridge-context`
request header so any Bridge backend (nestjs / express) the request flows to
buckets the same identity. Convenience wrappers: `withFeatureFlag`,
`requireFeatureFlag` (page redirect), `requireApiFeatureFlag` (JSON 403).

## Server-side: API route handlers

```ts
import { NextRequest } from 'next/server';
import { requireFeatureFlagForRoute } from '@nebulr-group/bridge-nextjs/server';

export function GET(request: NextRequest) {
  return requireFeatureFlagForRoute('beta-api', async () => {
    return Response.json({ ok: true });
  })(request);
}
```

When the flag passes, the handler runs and the response carries the
`x-bridge-context` header for downstream propagation. When it fails, a JSON 403
is returned.

## Environment variables

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_BRIDGE_APP_ID` | Your Bridge app id — the workspace flags evaluate against. |
| `NEXT_PUBLIC_BRIDGE_API_BASE_URL` | Bridge API root (defaults to `https://api.thebridge.dev`). |

The flag SDK reads `appId` + `apiBaseUrl` from the BridgeAuth config — no
separate flag configuration is needed.

## Caching & freshness

- **Client:** the flag cache hydrates on bootstrap and re-hydrates on every
  realtime reconnect; live updates push individual flag changes. No TTL — it's a
  live channel.
- **Server:** flag rules are read through a short-lived pull cache (default 30s
  TTL) and evaluated locally per request. Expect up to one TTL window of delay
  after toggling a flag before server-rendered output changes.

## Common pitfalls

- **Use `flagKey`, not `key`.** React reserves `key`; the component will never
  receive a prop named `key`.
- **Flags before authentication:** anonymous users still get evaluated (the SDK
  tracks an anonymous identity). Rule-targeted flags that need a logged-in user
  fall through to the default — always pass a sensible `defaultValue` / `fallback`.
- **Flag keys must match exactly** what's in the Bridge admin UI. Typos silently
  return the default.
- **Backend mode refuses to bucket without identity:** server evals of
  rolled-out (`rolloutPct < 100`) rules return the safe default when the request
  has no token — by design.
