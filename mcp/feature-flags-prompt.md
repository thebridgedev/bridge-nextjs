# Bridge Next.js — Feature Flags

You are adding **Feature Flags** to a Next.js 15+ App Router application that uses The Bridge. The goal is to ship code behind a switch you control from the Bridge dashboard — no redeploy needed. Next.js can read flags on the **client** (realtime) and on the **server** (per request) — both are covered below.

## Decide first — where is the flag read, and what does it gate?

Next.js reads flags in two places with different guarantees, and picking the wrong one fails silently: the read returns its default and looks like a flag that is simply off.

| You are gating | Read it with | Import from |
|---|---|---|
| Markup in a **client** component | `<FeatureFlag flagKey="…">` | `/client` |
| Markup in a **server** component | `<ServerFeatureFlag flagName="…">` | `/server` |
| Behaviour or a **value** — a limit, an endpoint, a `string`/`number`/JSON flag | `useFlag(key, default)`, or `flagStore(key, default)` outside React | `/client` |
| A value on the server | `FeatureFlagServer.getInstance().flagServer(key, default, request)` | `/server` |
| A whole **path tree** | `withFeatureFlags([...])` in `middleware.ts`, or a `featureFlag` rule on `withBridgeAuth` | `/server` |
| One **route handler** | `requireFeatureFlagForRoute(key, handler)` | `/server` |
| Client-side navigation, when the middleware is not the guard | `createRouteGuard({ rules: [...] })` | `/client` |

The prop name differs between the two components — `flagKey` on the client one, `flagName` on the server one. Neither errors on the wrong name; the read just returns the default.

> **The client and the server do not see the same identity.** The server builds its eval context from the `bridge_access_token` cookie, which only the **hosted-auth** callback route writes. An SDK-auth app keeps tokens in `localStorage`, so the server sees no identity at all: every rule targeting `user.*` / `tenant.*`, and any `rolloutPct < 100`, falls back to the safe default. If the app signs in with `<LoginForm />`, gate on the client.

**Client reads are realtime; server reads are a 30s pull cache.** Expect up to one TTL window of lag after a toggle before server-rendered output changes — and keep the route dynamic, or a cached route bakes in the old verdict.

If both would work, prefer the client: it updates live, and a client eval is the only thing that auto-creates an unknown flag key in the dashboard.

## Prerequisites check

Before starting, verify that Bridge is set up in this project:

1. `@nebulr-group/bridge-nextjs` is in `package.json` dependencies
2. `app/layout.tsx` wraps the app in `<BridgeProvider>` from `@nebulr-group/bridge-nextjs/client`
3. `NEXT_PUBLIC_BRIDGE_APP_ID` is set in `.env.local`
4. For the server-side section only: the hosted-auth callback route exists (`app/auth/oauth-callback/route.ts` calling `createBridgeCallbackRoute`) — that route is what puts the token in a cookie the server can read

If any are missing, run `bridge guide nextjs` first.

## Step 1 — Activate the flags layer

There is no separate package and no `/flags` subpath — the flag runtime is folded into `@nebulr-group/bridge-nextjs/client` (browser) and `@nebulr-group/bridge-nextjs/server` (server). `<BridgeProvider>` bootstraps it for you on first client render: it calls `createBridgeFlags()` after the core runtime starts, which sets up the local eval cache, hydration from the workspace, attribute providers and realtime updates on the same channel as auth and billing.

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

Nothing else to wire. Flags start evaluating for all visitors as soon as the provider mounts — login is not required.

## Step 2 — Create the demo page

Create `app/flags-demo/page.tsx` with the content below. It uses `<FeatureFlag>` to gate a visible box: grey with a striped border when the flag is off, solid green when it is on. The flag is auto-created in Bridge as off the first time the page loads.

> React reserves the prop name `key` for reconciliation, so the flag key is passed as **`flagKey`**.

```tsx
// app/flags-demo/page.tsx
'use client';

import { FeatureFlag } from '@nebulr-group/bridge-nextjs/client';

const box = { margin: '2rem auto', padding: '2.5rem 2rem', borderRadius: 10, transition: 'background 0.4s ease' };
const off = { ...box, color: '#555', border: '8px solid transparent',
  background: 'linear-gradient(#f0f0f0, #f0f0f0) padding-box, repeating-linear-gradient(45deg, #aaa 0, #aaa 8px, transparent 8px, transparent 18px) border-box' };
const on = { ...box, background: '#d4edda', border: '4px solid #28a745', color: '#155724' };
const icon = { fontSize: '2.5rem', marginBottom: '0.75rem' };
const hint = { fontSize: '0.8rem', opacity: 0.65, marginTop: '0.5rem' };

export default function FlagsDemo() {
  return (
    <div style={{ maxWidth: 480, margin: '4rem auto', fontFamily: 'sans-serif', textAlign: 'center' }}>
      <h1>Feature Flag Demo</h1>
      <p>Toggle <strong>demo-flag</strong> in the Bridge dashboard and watch this box change — no refresh needed.</p>

      <FeatureFlag
        flagKey="demo-flag"
        defaultValue={false}
        fallback={
          <div style={off}>
            <div style={icon}>⚑</div>
            <p>This box will turn green once you enable <strong>demo-flag</strong></p>
            <p style={hint}>Go to Feature Control in the Bridge dashboard and flip it on.</p>
          </div>
        }
      >
        <div style={on}>
          <div style={icon}>✓</div>
          <p><strong>demo-flag</strong> is <strong>enabled</strong></p>
          <p style={hint}>Go to Feature Control in the Bridge dashboard to toggle it off again.</p>
        </div>
      </FeatureFlag>
    </div>
  );
}
```

**After creating the file, tell the user:**

> I've created a feature flag demo page at `/flags-demo`. Open it in your browser, then go to **Feature Control** in the Bridge dashboard and toggle **demo-flag** on — the box will turn green without a page refresh.

## How `FeatureFlag` works

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `flagKey` | `string` | yes | Flag key — auto-created in Bridge on first client eval if it doesn't exist. Named `flagKey` because React reserves `key` |
| `defaultValue` | `T` | yes | Value returned until the cache hydrates or if the flag doesn't exist |
| `context` | `Partial<EvalContext>` | no | Per-call eval context — see *Eval context* below |
| `children` | `ReactNode \| (value: T) => ReactNode` | no | Rendered when the flag is on (`passed: true`). As a render-prop it receives the typed flag value |
| `fallback` | `ReactNode \| (value: T) => ReactNode` | no | Rendered when the flag is off (`passed: false`). Same render-prop form |

Use the same `<FeatureFlag>` anywhere in a client component to gate any content behind a flag.

## Step 3 — Configure how the flag decides (states and rules)

A flag has exactly **three states**. `off` and `on` apply to everyone; `on-with-rule` decides per visitor.

| State | Meaning |
|---|---|
| `off` | Everyone gets the off value. A newly auto-created flag starts here |
| `on` | Everyone gets the on value |
| `on-with-rule` | The rule decides. Whoever matches a branch gets that branch's value; everyone else gets `otherwiseValue` |

A rule is **branches + otherwiseValue + rolloutPct**, first match wins:

```jsonc
{
  "branches": [
    { "conditions": [ { "attribute": "tenant.plan", "operator": "in", "values": ["pro", "enterprise"] } ],
      "returnValue": true }
  ],
  "otherwiseValue": false,
  "rolloutPct": 100          // 0-100, applies to the WHOLE rule
}
```

- Conditions inside one branch are AND-ed; add more branches for OR / different return values.
- Operators: `eq` `neq` `contains` `not_contains` `in` `not_in` `gt` `lt` `between` `regex` `exists` `not_exists` (numeric and date operators only apply to those attribute types).
- `attribute` is a dotted path into the eval context (next step). With Bridge Auth, `user.id` `user.role` `user.email` `tenant.id` `tenant.plan` are populated for you.
- **`rolloutPct` below 100 requires an identity** on the eval context — bucketing is `hash(flagKey + identity) mod 100`. With no identity the SDK refuses to bucket and returns the safe value rather than randomizing per call.

Configure it either in the dashboard under **Feature Control**, or from the CLI — prefer the CLI when you are an agent, since it is scriptable and verifiable:

```bash
bridge flag create --key enterprise-export --value-type boolean --state on-with-rule \
  --rule '{"branches":[{"conditions":[{"attribute":"tenant.plan","operator":"in","values":["pro","enterprise"]}],"returnValue":true}],"otherwiseValue":false,"rolloutPct":100}'

# prove the rule does what you meant, without touching the app:
bridge flag eval enterprise-export --identity user-123 --attribute tenant.plan=pro   # → true
bridge flag eval enterprise-export --identity user-123 --attribute tenant.plan=free  # → false
```

`bridge flag list` / `get <key>` inspect the current state. To flip a flag without touching its rule, `bridge flag update` addresses it **by id, not by key** — read the id first:

```bash
bridge flag get <key>                      # id is in the output
bridge flag update --id <id> --state on    # or --state off | on-with-rule
```

## Step 4 — Feed the rule its inputs (eval context)

Rules can only target what the app sends. Flags don't require auth — without it you supply the context yourself:

```ts
{
  identity?: string;                    // stable per-user id — required when rolloutPct < 100
  attributes: Record<string, unknown>;  // dotted or nested; whatever your rules target
}
```

Per call, on the component (or as the third argument to `useFlag`):

```tsx
<FeatureFlag flagKey="enterprise-export" defaultValue={false}
  context={{ identity: user.id, attributes: { 'tenant.plan': plan } }}>
  <ExportButton />
</FeatureFlag>
```

Or publish attributes once, app-wide, on the `bridge` surface (client entry — there is no package-root import):

```ts
'use client';
import { bridge } from '@nebulr-group/bridge-nextjs/client';

bridge.attributes.set('tenant.plan', plan);            // static value
bridge.attributes.bind('seats', () => currentSeats);   // live — re-read on every eval
bridge.attributes.bindMany(() => ({ region, betaOptIn }));
```

Per-call context wins on key collision. **With Bridge Auth**, the signed-in user's role and plan flow in automatically (`user.role`, `tenant.plan`) — no wiring needed; see `bridge guide nextjs sdk-auth`.

## Step 5 — Server-side flags

Next.js evaluates flags on the server too, in **backend mode**: `FeatureFlagServer` pulls the workspace's flag rules from the Bridge API through a short-lived cache (**30s TTL**) and evaluates them locally, per request. There is no realtime channel on the server — expect up to one TTL window of delay after a toggle before server-rendered output changes.

**Server component** — `<ServerFeatureFlag>` is an async server component; it reads cookies via `next/headers`, which makes the route dynamic:

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

Props: `flagName` (note: **not** `flagKey` here), `children`, `fallback`, `negate` (invert), `redirectTo` (redirect when the flag fails and no `fallback` is given), `config` (per-call config override).

**Route handler** — the wrapped handler must return a `NextResponse`; a third options arg takes `{ errorMessage, statusCode }` (default 403) and `config`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { requireFeatureFlagForRoute } from '@nebulr-group/bridge-nextjs/server';

export function GET(request: NextRequest) {
  return requireFeatureFlagForRoute('beta-api', async () => NextResponse.json({ ok: true }))(request);
}
```

**Middleware** — guard whole path trees. A trailing `/*` matches by prefix, so list the bare path too:

```ts
// middleware.ts
import { withFeatureFlags } from '@nebulr-group/bridge-nextjs/server';

export const middleware = withFeatureFlags([
  { flag: 'beta-dashboard', paths: ['/beta', '/beta/*'], redirectTo: '/' },
  { flag: 'beta-api', paths: ['/api/beta/*'], responseType: 'error', errorStatus: 403 },
]);

export const config = { matcher: ['/beta/:path*', '/api/beta/:path*'] };
```

`withFeatureFlag`, `requireFeatureFlag` (page redirect) and `requireApiFeatureFlag` (JSON error) are thin wrappers over the same thing. Requests to `/api/*` or with `Accept: application/json` always get the JSON error form regardless of `responseType`.

For a typed (non-boolean) server read, use the service directly — it needs a `NextRequest`, so it fits route handlers and middleware:

```ts
import { FeatureFlagServer } from '@nebulr-group/bridge-nextjs/server';
const limit = await FeatureFlagServer.getInstance().flagServer<number>('upload-limit', 5, request);
```

**How eval context reaches the server, precisely:**

- It is built from the **`bridge_access_token` cookie** on the request: `sub` → `identity`, and `role` / `email` / `tid` / `plan` / `privileges` → `user.role`, `user.email`, `tenant.id`, `tenant.plan`, `privileges`. That cookie is written by the hosted-auth callback route (`createBridgeCallbackRoute`). SDK-auth login stores tokens in `localStorage` only, so with SDK auth the server sees **no identity** — rules targeting `user.*` / `tenant.*` and any `rolloutPct < 100` fall back to the safe default.
- **Outbound propagation works:** middleware and `requireFeatureFlagForRoute` serialize the context onto the `x-bridge-context` header (`BRIDGE_CONTEXT_HEADER`) so a downstream Bridge backend (nestjs / express) buckets the same identity. `serializeContext` / `deserializeContext` / `serverInstanceId` are re-exported from `/server` for custom wiring.
- **`x-bridge-context` is internal, never trusted from clients:** the SDK builds it from the verified session token only, strips any client-supplied copy on every middleware path and in `requireFeatureFlagForRoute` (the handler receives the sanitized request), and `FeatureFlagServer` never reads an inbound one — the verified cookie is the only source. Do not forward a browser's own `x-bridge-context` to a backend yourself.
- **Not supported today:** There is no per-call `context` prop on any server primitive, and `bridge.attributes` is client-only, so dev-supplied attributes do not reach server evals. Unknown flag keys are auto-created only from **client** evals; a key used exclusively on the server will not appear in the dashboard until you create it (`bridge flag create --key …`).

## Gating logic instead of markup

`<FeatureFlag>` gates *markup*. When the flag decides **behavior or supplies a value** — which endpoint to call, a numeric limit to enforce, a `string`/`number`/JSON flag value you compute with — read it directly instead:

```tsx
'use client';
import { useFlag } from '@nebulr-group/bridge-nextjs/client';

const { value: limit } = useFlag('upload-limit', 5);   // { value, passed }, re-renders on change
```

`useFlag(key, defaultValue, context?)` is the whole hook. For non-React code there is `flagStore(key, defaultValue, context?)` with a `subscribe(run)` method. For anything this prompt doesn't cover — route guards, standalone `createBridgeFlags()` instances, caching details — read `learning/feature-flags/feature-flags.md` rather than guessing an API.

## Troubleshooting

- **`useFlag` / `<FeatureFlag>` used in a server component**, or *"Functions cannot be passed directly to Client Components"* from the render-prop form of `children`/`fallback`. Both are client-only — add `'use client'` to the file, or move the gate into a client child.
- **You wrote `key=` instead of `flagKey=`.** React swallows `key`; the component never receives it and every read returns the default. (The server component uses `flagName`.)
- **`<BridgeProvider>` missing or `appId` unset.** The flag layer bootstraps on the provider's first client render; without it every read returns the default. Check `NEXT_PUBLIC_BRIDGE_APP_ID` in `.env.local` and restart the dev server.
- **A flag registers only once it has been evaluated** — load a page that actually reads the key, on the *client*.
- **Rule never matches?** Run `bridge flag eval <key> --identity … --attribute k=v` to see the verdict without the app in the way, then confirm the app sends those same attributes.
- **Server render doesn't change after a toggle.** The 30s pull cache, not a bug. Also make sure the route is dynamic — a statically rendered / cached route bakes in the old verdict.
- **Server eval always returns the default for a rule-targeted flag.** No `bridge_access_token` cookie on the request, so there is no identity. See Step 5.
- **Realtime.** Client-side live toggles ride the realtime channel; if a proxy blocks WebSockets the value still resolves on next load, just not instantly.
- **First-render flicker is expected** — flags hydrate async. Set `defaultValue` to the safe-off state.

## Verify

1. Navigate to `/flags-demo` in the browser. The grey striped box should appear — Bridge auto-creates `demo-flag` as off.
2. Go to **Feature Control** in the Bridge dashboard and toggle `demo-flag` on (or take the id from `bridge flag get demo-flag` and run `bridge flag update --id <id> --state on`).
3. The box turns green **without a page refresh** — realtime updates are on by default.
4. Toggle it off again to confirm it reverts.
5. (Server) Wrap something in `<ServerFeatureFlag flagName="demo-flag">…</ServerFeatureFlag>` on a server component, toggle the flag, and reload after ~30s — the server-rendered output follows the flag.
