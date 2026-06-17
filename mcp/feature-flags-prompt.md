# Bridge Next.js — Feature Flags

You are adding **Feature Flags 2.0** to a Next.js 15+ App Router application that
uses The Bridge. The goal is to ship code behind a switch you control from the
Bridge dashboard — no redeploy needed. Flags can be checked on the **client**
(React components / hooks) and on the **server** (server components, route
handlers, middleware).

Bridge evaluates flags **locally in the SDK** against a cache of flag rules that
syncs live from the Bridge API. On the client the cache rides the same realtime
channel as auth + billing — toggling a flag updates the app without a refresh. On
the server, flags evaluate in backend-mode against the request's token claims.

## Prerequisites check

Before starting, verify that Bridge is set up in this project:

1. `@nebulr-group/bridge-nextjs` is in `package.json` dependencies
2. `app/layout.tsx` wraps the app in `<BridgeProvider>`
3. The OAuth callback route exists (`app/auth/oauth-callback/page.tsx`)
4. `NEXT_PUBLIC_BRIDGE_APP_ID` is set in `.env.local`

If any are missing, run `bridge guide nextjs` first.

## Step 1 — Activate the flags layer

There is no separate package or subpath to install — Feature Flags 2.0 is folded
into `@nebulr-group/bridge-nextjs/client` and `@nebulr-group/bridge-nextjs/server`.
`<BridgeProvider>` initializes the flag layer for you on mount (after the core
runtime starts): the local eval cache, hydration from the workspace, attribute
providers, and realtime updates.

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

Flags start evaluating for all visitors as soon as `<BridgeProvider>` mounts —
login is not required.

## Step 2 — Create the demo page (client)

Create `app/flags-demo/page.tsx`. It uses `<FeatureFlag>` to gate a visible box.
The flag is auto-created in Bridge as off the first time the page loads.

> **Note:** React reserves the prop name `key`, so the flag key is passed as
> `flagKey`. `children` renders when the flag is on; `fallback` when it is off.

```tsx
// app/flags-demo/page.tsx
'use client';

import { FeatureFlag } from '@nebulr-group/bridge-nextjs/client';

export default function FlagsDemo() {
  return (
    <div style={{ maxWidth: 480, margin: '4rem auto', textAlign: 'center' }}>
      <h1>Feature Flag Demo</h1>
      <p>
        Toggle <strong>demo-flag</strong> in the Bridge dashboard and watch this
        box change — no refresh needed.
      </p>

      <FeatureFlag
        flagKey="demo-flag"
        defaultValue={false}
        fallback={
          <div style={{ padding: '2.5rem', background: '#f0f0f0', color: '#555', borderRadius: 10 }}>
            This box turns green once you enable <strong>demo-flag</strong>.
          </div>
        }
      >
        {() => (
          <div style={{ padding: '2.5rem', background: '#d4edda', color: '#155724', borderRadius: 10 }}>
            <strong>demo-flag</strong> is <strong>enabled</strong>.
          </div>
        )}
      </FeatureFlag>
    </div>
  );
}
```

**After creating the file, tell the user:**

> I've created a feature flag demo page at `/flags-demo`. Open it in your browser,
> then go to **Feature Control** in the Bridge dashboard and toggle **demo-flag**
> on — the box turns green without a page refresh.

## Step 3 — The `useFlag` hook

For imperative checks, use the hook instead of the component:

```tsx
'use client';
import { useFlag } from '@nebulr-group/bridge-nextjs/client';

export function ConditionalButton() {
  const { passed } = useFlag('new-checkout', false);
  if (!passed) return null;
  return <button>Try the new checkout</button>;
}
```

Both the component and the hook accept a `context` for dev-supplied per-call
attributes (e.g. `{ attributes: { plan } }`) — these override server-side values
for that key. You can also declare attributes globally via
`bridge.attributes.set(...)` / `bridge.attributes.bindMany(...)`.

## Step 4 — Server-side flags (Next.js-specific)

Next.js can evaluate flags on the server, which Svelte's client-only SDK cannot.
All three server primitives evaluate in **backend-mode** against the request's
token claims and propagate the eval context downstream via the
`x-bridge-context` header so any Bridge backend (nestjs / express) buckets the
same identity.

**Server component:**

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

`<ServerFeatureFlag>` also supports `negate` and `redirectTo` for access control.

**Route handler:**

```ts
import { NextRequest } from 'next/server';
import { requireFeatureFlagForRoute } from '@nebulr-group/bridge-nextjs/server';

export function GET(request: NextRequest) {
  return requireFeatureFlagForRoute('beta-api', async () => {
    return Response.json({ ok: true });
  })(request);
}
```

**Middleware:**

```ts
// middleware.ts
import { withFeatureFlags } from '@nebulr-group/bridge-nextjs/server';

export const middleware = withFeatureFlags([
  { flag: 'beta-dashboard', paths: ['/beta', '/beta/*'], redirectTo: '/' },
  { flag: 'beta-api', paths: ['/api/beta/*'], responseType: 'error', errorStatus: 403 },
]);

export const config = { matcher: ['/beta/:path*', '/api/beta/:path*'] };
```

## How `FeatureFlag` works

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `flagKey` | `string` | yes | Flag key — auto-created in Bridge on first eval if it doesn't exist. (Named `flagKey` because React reserves `key`.) |
| `defaultValue` | `T` | yes | Value returned until the cache hydrates or if the flag doesn't exist |
| `context` | `Partial<EvalContext>` | no | Per-call attributes, e.g. `{ attributes: { plan } }`. Override server values for that key |
| `children` | `ReactNode \| (value: T) => ReactNode` | no | Rendered when the flag is on (`passed: true`). Render-prop receives the typed value |
| `fallback` | `ReactNode \| (value: T) => ReactNode` | no | Rendered when the flag is off (`passed: false`) |

`useFlag(key, defaultValue, context?)` returns `{ value, passed }` and re-renders
on every change to that flag.

## Environment variables

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_BRIDGE_APP_ID` | Your Bridge app id — the workspace flags evaluate against |
| `NEXT_PUBLIC_BRIDGE_API_BASE_URL` | Bridge API root (defaults to `https://api.thebridge.dev`) |

## Integration checklist

- [ ] `<BridgeProvider>` wraps the app in `app/layout.tsx`.
- [ ] At least one `<FeatureFlag flagKey=…>` or `useFlag(…)` call exists on the client.
- [ ] Server-side flags use `<ServerFeatureFlag>` / `requireFeatureFlagForRoute` / `withFeatureFlags` middleware.
- [ ] `NEXT_PUBLIC_BRIDGE_APP_ID` is set.

## Verify

1. Navigate to `/flags-demo` in the browser. The grey box appears — Bridge
   auto-creates `demo-flag` as off.
2. Go to **Feature Control** in the Bridge dashboard and toggle `demo-flag` on.
3. The box turns green **without a page refresh** — realtime updates are on by
   default.
4. Toggle it off again to confirm it reverts.
5. (Server) Wrap content in `<ServerFeatureFlag flagName="demo-flag">…</ServerFeatureFlag>`
   on a server component and confirm it renders based on the flag for the signed-in user.
