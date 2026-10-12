# Bridge Next.js — Integration Prompt

You are integrating **`@nebulr-group/bridge-nextjs`** (the Next.js plugin of the Bridge SDK platform) into a Next.js 15+ App Router project. Sign-in happens inside the app: the login, signup and password pages render in the app's own layout, and the plugin serves every one of them from one file. Follow these steps in order. Do not skip steps. For the sign-in pages in detail, matching them to the app's design and customising them, read `sdk-auth-prompt.md` (`get_integration_guide` topic `auth`, or `bridge guide nextjs sdk-auth`).

## How routes are guarded

Next.js has a server layer the other frontends do not, so be clear about which layer decides who gets in. It is the mistake with the largest blast radius in this package.

- **`<ProtectedRoute>` in each protected page is the route guard.** Sign-in happens inside the app and the tokens live in the browser.
- **`withBridgeAuth` in `middleware.ts` is not the guard.** It cannot see a browser-held session, and redirecting would loop a signed-in user, so it lets a request without a Bridge session cookie through. One dev-only warning says so.
- **Route guards are not authorization.** They decide what the browser is shown. Every API route verifies the user's token itself.

> **A page you protect only in `middleware.ts` is not protected.** The middleware lets it through by design, the page renders, and nothing looks wrong, until someone opens the URL signed out. Every protected page needs `<ProtectedRoute>`.

## Prerequisites

- Next.js **15.x or later** with the **App Router** (`app/` directory).
- React 18+.
- A registered Bridge app — you will need its `appId` (set via `NEXT_PUBLIC_BRIDGE_APP_ID`).
- For signup to work, the Bridge app must have **`tenantSelfSignup: true`** enabled on the backend.

## Migration check

If the project still has the legacy package `@nblocks/nblocks-nextjs`, remove it first:

```bash
npm uninstall @nblocks/nblocks-nextjs
```

Translation reference:

| Legacy (`@nblocks/nblocks-nextjs`) | New (`@nebulr-group/bridge-nextjs`) |
|---|---|
| `NblocksProvider` | `BridgeProvider` |
| `useNblocksAuth` | `useAuth` |
| `useNblocksProfile` | `useProfile` |
| `NBLOCKS_APP_ID` env var | `NEXT_PUBLIC_BRIDGE_APP_ID` env var |

## Install

```bash
npm install @nebulr-group/bridge-nextjs
```

## Environment variables

Create `.env.local` at the project root:

```env
NEXT_PUBLIC_BRIDGE_APP_ID=your-app-id
NEXT_PUBLIC_BRIDGE_LOGIN_ROUTE=/auth/login
# Only for a stage/local app (unset = production). Bridge's other domains
# follow it (api-stage → auth-stage):
# NEXT_PUBLIC_BRIDGE_API_BASE_URL=https://api-stage.thebridge.dev
# Only for a local or self-hosted Bridge:
# NEXT_PUBLIC_BRIDGE_HOSTED_URL=http://localhost:3191
# Rarely needed:
# NEXT_PUBLIC_BRIDGE_CALLBACK_URL=http://localhost:3000/auth/oauth-callback
# NEXT_PUBLIC_BRIDGE_DEFAULT_REDIRECT_ROUTE=/
# NEXT_PUBLIC_BRIDGE_SIGNUP_ROUTE=/auth/signup
# NEXT_PUBLIC_BRIDGE_DEBUG=true
```

`NEXT_PUBLIC_BRIDGE_LOGIN_ROUTE` (or the `loginRoute` option on `<BridgeProvider config>` and `withBridgeAuth`) is where a signed-out visitor is sent: the app's own `/auth/login`.

(If the developer explicitly asks for Bridge's hosted sign-in page, or the app already uses it, respect that: leave out `loginRoute`. Then the session is a cookie and `withBridgeAuth` in `middleware.ts` is the guard, verifying the `bridge_access_token` cookie; the callback is `app/auth/oauth-callback/route.ts` with `createBridgeCallbackRoute`, and sign-in is `useAuth().login()`. Follow `learning/quickstart/hosted-quickstart.md` in the package repo for that setup.)

## Wire the root layout

Edit `app/layout.tsx`:

```tsx
import { BridgeProvider } from '@nebulr-group/bridge-nextjs/client';
import '@nebulr-group/bridge-nextjs/styles';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <BridgeProvider>
          {children}
        </BridgeProvider>
      </body>
    </html>
  );
}
```

`BridgeProvider` automatically reads the `NEXT_PUBLIC_BRIDGE_*` variables. You can also pass `appId` or `config={{...}}` as props; a prop wins over the variable. The config is plain data, so the Server Component layout passes it directly — do not create a client "Providers" wrapper for it.

## Create the sign-in pages — one file

```tsx
// app/auth/[...bridge]/page.tsx
import { BridgeAuthRoutes } from '@nebulr-group/bridge-nextjs/client';

export default function AuthPage() {
  return <BridgeAuthRoutes />;
}
```

It serves `/auth/login`, `/auth/signup`, `/auth/oauth-callback`, `/auth/set-password/[token]`, `/auth/forgot-password`, `/auth/magic-link`, `/auth/setup-passkey/[token]` and `/auth/workspaces`. Do not create those pages one by one. `/auth/set-password/[token]` is where every signup-verification and password-reset email lands. Make the pages match the app's design as `sdk-auth-prompt.md` describes.

## Configure the Bridge app

In the Bridge admin UI for your app, set:
- **Callback URL:** `http://localhost:3000/auth/oauth-callback` (and your production URL).
- **Default redirect:** `/`.
- Enable **`tenantSelfSignup`**, and toggle individual auth methods (magic link, passkeys, password) as needed.

## Sign in and out

```tsx
'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@nebulr-group/bridge-nextjs/client';

export default function AuthControls() {
  const { isAuthenticated, logout } = useAuth();
  const router = useRouter();
  return isAuthenticated
    ? <button onClick={async () => { await logout(); router.push('/auth/login'); }}>Sign out</button>
    : <Link href="/auth/login">Sign in</Link>;
}
```

Sign in is a link to the app's own `/auth/login`. `logout()` clears the session in the browser; send the user to `/auth/login` after it.

## Route protection

### Every protected page — `<ProtectedRoute>`

```tsx
'use client';
import { ProtectedRoute } from '@nebulr-group/bridge-nextjs/client';

export default function DashboardPage() {
  return (
    <ProtectedRoute redirectTo="/auth/login">
      <Dashboard />
    </ProtectedRoute>
  );
}
```

A signed-out visitor is sent to `/auth/login` with the page they asked for remembered, and brought back to it after sign-in. Pass `redirectTo="/auth/login"`: without it the redirect goes to `/`.

### `middleware.ts` is not the guard

Sign-in needs no `middleware.ts`. If the app has one with `withBridgeAuth` (for example for a `featureFlag` rule), it does not protect pages: tokens live in the browser, invisible to middleware, so it lets requests without a Bridge session cookie through (one dev-only warning). Wrap the page in `<ProtectedRoute>` anyway.

### API routes verify the token

`<ProtectedRoute>` decides what the browser is shown. It is not authorization. Every API route reads the `Authorization: Bearer <token>` header and verifies the token itself: its PS256 signature against the Bridge JWKS (`<apiBaseUrl>/auth/.well-known/jwks.json`), issuer `<apiBaseUrl>/auth`, audience containing your `appId`, and expiry. A missing, forged, foreign or expired token gets `401`.

## Accessing user context

```tsx
'use client';
import { useProfile, useIsOnboarded, useAuthState } from '@nebulr-group/bridge-nextjs/client';

export function Welcome() {
  const { profile } = useProfile();
  const isOnboarded = useIsOnboarded();
  const authState = useAuthState();
  if (authState !== 'authenticated') return null;
  return (
    <p>
      Welcome, {profile?.fullName ?? profile?.email}
      {!isOnboarded && ' — please complete onboarding'}
    </p>
  );
}
```

## Authenticated API calls

Use `getBridgeAuth()` for the access token:

```ts
'use client';
import { getBridgeAuth } from '@nebulr-group/bridge-nextjs/client';

export async function fetchUserData() {
  const token = getBridgeAuth().getTokens()?.accessToken;
  const res = await fetch('/api/user', {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.json();
}
```

## Integration checklist

- [ ] `@nebulr-group/bridge-nextjs` installed.
- [ ] `NEXT_PUBLIC_BRIDGE_APP_ID` set in `.env.local`.
- [ ] `app/layout.tsx` wraps children in `<BridgeProvider>`.
- [ ] `@nebulr-group/bridge-nextjs/styles` imported in `app/layout.tsx`.
- [ ] `NEXT_PUBLIC_BRIDGE_LOGIN_ROUTE=/auth/login` set (or the `loginRoute` option).
- [ ] `app/auth/[...bridge]/page.tsx` renders `<BridgeAuthRoutes />`.
- [ ] Bridge app's callback URL set to `{origin}/auth/oauth-callback`.
- [ ] Every protected page wrapped in `<ProtectedRoute redirectTo="/auth/login">`; none relies on `middleware.ts` alone.
- [ ] Every API route verifies the user's token itself.
- [ ] A "Sign in" link to `/auth/login` and a "Sign out" button calling `useAuth().logout()` wired in the UI.

## Verify the integration

1. Run `npm run dev`.
2. Open `http://localhost:3000`.
3. Click "Sign in" — you land on the app's own `/auth/login`, styled like the app.
4. Complete login — you land back on `/` with `isAuthenticated === true`.
5. Signed out, open a protected page — you are sent to `/auth/login`, and after signing in you land back on that page.
6. Call a protected API route without a token — it answers `401`.
7. Click "Sign out" — `isAuthenticated` flips back to `false` and you land on `/auth/login`.

If `useAuth` returns the wrong state, check the browser console for `[BridgeProvider]` debug logs (set `NEXT_PUBLIC_BRIDGE_DEBUG=true`).

## Unified `bridge` surface (Live Channel Unification — recommended for new code)

The Live Channel Unification surface introduces a single scoped read surface. **Use this for new code instead of reaching for individual hooks like `useSubscription`, `getBridgeAuth().getProfile()`, etc.** The existing hooks still work and read from the same internal state.

### Three scopes, one object

```ts
'use client';
import { useBridge } from '@nebulr-group/bridge-nextjs/client';

const bridge = useBridge();

// app — anything tied to the app config (whitelabel, plan catalog, flag defs)
bridge.app.branding              // readable of BrandingSnapshot | null
bridge.app.plans                 // LazySlice<Plan[]>  ← await it, or .load()

// tenant — anything tied to the workspace/tenant
bridge.tenant.id                 // readable of string | null
bridge.tenant.name               // readable of string | null
bridge.tenant.subscription       // readable of SubscriptionSnapshot | null
bridge.tenant.entitlements       // { can(key): boolean, snapshot: readable<...> }

// user — anything tied to the authenticated user
bridge.user                      // readable of UserSnapshot | null  // { id, email, role, tenantId }
```

Each readable exposes `subscribe(fn)` — `fn` is called immediately with the current value and again on every change, returning an unsubscribe function. In a component, wire them in `useEffect`:

```tsx
'use client';
import { useEffect, useState } from 'react';
import { useBridge, type UserSnapshot } from '@nebulr-group/bridge-nextjs/client';

export function Greeting() {
  const bridge = useBridge();
  const [user, setUser] = useState<UserSnapshot | null>(null);
  useEffect(() => bridge.user.subscribe(setUser), [bridge]);
  return <p>Hello {user?.email}</p>;
}
```

### How data lands

- **Snapshot slices** (`app.branding`, `tenant.{id,name,subscription,entitlements}`, `user`) are pushed by the server in a single `session.snapshot` message the moment the per-user channel subscribes. First paint reflects real state — no flicker, no per-slice REST hydrate.
- **Lazy slices** (`app.plans` today) start `null` and populate on first `.load()` or `await`:

  ```ts
  const plans = await bridge.app.plans;             // thenable sugar
  const plans = await bridge.app.plans.load();      // explicit
  ```

- **Reconnect** re-emits the snapshot; lazy slices that were loaded keep their values and update via channel deltas (no automatic refetch).

### Reading entitlements

```ts
if (bridge.tenant.entitlements.can('ai_completions')) {
  // render the feature
}
```

`can()` is synchronous and reflects the latest snapshot or `entitlements.changed` push.

### Live events & connection status

`bridge.events.handle({...})` is the one API for reacting to channel events (analytics, audit, alerting). `useRealtimeStatus()` exposes the connection state for offline indicators. See `learning/live-updates/live-updates.md` for the full event-kind list and attribute write surface (`bridge.attributes`).

### Mapping from existing hooks

| Existing | Unified surface |
|---|---|
| `useSubscription()` (status) | `bridge.tenant.subscription` |
| `getBridgeAuth().getProfile()` | `bridge.user` (snapshot) — full Profile via `getBridgeAuth().getProfile()` still works for fields outside the snapshot |
| `getBridgeAuth().getPlans()` | `bridge.app.plans.load()` — lazy + cached |

Both surfaces are fed by the same internal state and can be used side by side.
