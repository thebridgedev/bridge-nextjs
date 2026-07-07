---
title: Route guards
description: Frontend route guards for Next.js.
sidebar:
  label: Next.js
---

# Route guards

Route protection in Next.js happens in **middleware** — it runs before a request reaches a page (Server or Client Component), so unauthenticated users never get a flash of protected content. Declare which routes are public, protected, or default-protected with `withBridgeAuth` in `middleware.ts`:

```ts
// middleware.ts
import { withBridgeAuth } from '@nebulr-group/bridge-nextjs/server';

export default withBridgeAuth({
  rules: [
    { match: '/', public: true },
    { match: /^\/auth($|\/)/, public: true },
  ],
  defaultAccess: 'protected',
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
```

The `config.matcher` export is standard Next.js middleware config — it controls which paths the middleware runs on at all. Excluding `_next/static`, `_next/image`, and `favicon.ico` avoids running the auth check against build assets.

**How it works:**

| Option | What it does |
|--------|--------------|
| `rules` | An array of `RouteRule` — marks individual paths as public. |
| `defaultAccess` | Sets whether routes not matched by any rule are `'public'` or `'protected'`. Defaults to `'protected'`. |
| `callbackPath` | The OAuth callback path, always treated as public. Defaults to `/auth/oauth-callback`. |
| `appId` / `authBaseUrl` / `callbackUrl` / `debug` | Optional config overrides — normally left unset so `NEXT_PUBLIC_BRIDGE_*` env vars are used instead. |

`RouteRule`:

```ts
interface RouteRule {
  /** Path to match — exact string, `/prefix/` style, or a RegExp. */
  match: string | RegExp;
  /** Route is accessible without authentication. */
  public?: boolean;
  /** Feature flag requirement — see the note below. */
  featureFlag?: string | { any: string[] } | { all: string[] };
  /** Where to send users who fail the featureFlag requirement. */
  redirectTo?: string;
}
```

When a rule matches by string, it matches the exact path or any subpath (`pathname === match || pathname.startsWith(match + '/')`). RegExp rules use `pattern.test(pathname)` directly, exactly like the example above for `/auth/*`.

When `withBridgeAuth` decides a route is protected, it checks the `bridge_access_token` cookie (set during the OAuth callback — see below) via server-side JWT decoding, and redirects to the Bridge-hosted login URL if there's no valid token. It also opportunistically refreshes the token when it's within 5 minutes of expiring, so a long-lived session never needs a hard re-login.

## Flag-gated routes

The `featureFlag` / `redirectTo` fields on `RouteRule` exist for shape-parity with the rest of the SDK, but `withBridgeAuth` does not yet enforce them — a route with a `featureFlag` rule is currently treated the same as any other rule based on its `public` value. For flag-gated route protection today, use `withFeatureFlags` (documented in [Feature flags](../../feature-flags/feature-flags.md)) as a second layer, composed with `withBridgeAuth` inside your own `middleware.ts`:

```ts
// middleware.ts
import { NextRequest } from 'next/server';
import { withBridgeAuth } from '@nebulr-group/bridge-nextjs/server';
import { withFeatureFlags } from '@nebulr-group/bridge-nextjs/server';

const authMiddleware = withBridgeAuth({
  rules: [
    { match: '/', public: true },
    { match: /^\/auth($|\/)/, public: true },
  ],
  defaultAccess: 'protected',
});

const flagMiddleware = withFeatureFlags([
  { flag: 'beta-feature', paths: ['/beta', '/beta/*'], redirectTo: '/' },
]);

export default async function middleware(request: NextRequest) {
  const authResult = await authMiddleware(request);
  if (authResult.status === 307 || authResult.status === 308) return authResult; // redirected to login
  return flagMiddleware(request);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
```

## Client-side gating

For gating an individual page or component tree once you're inside the React tree (rather than at the middleware layer), use `<ProtectedRoute>`:

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

`<ProtectedRoute>` renders a loading placeholder while `useAuth()`'s `isLoading` is `true`, redirects (via `next/navigation`) to `redirectTo` (default `/`) if the user isn't authenticated once loading settles, and renders `children` otherwise. It's a client-side-only check — pair it with the middleware above for true request-time protection, since a fast client that briefly mounts before redirecting can still execute component effects.
