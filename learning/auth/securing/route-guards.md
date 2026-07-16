---
title: Route guards
description: Frontend route guards for Next.js.
sidebar:
  label: Next.js
---
import { Tabs, TabItem } from '@astrojs/starlight/components';

# Route guards

Pass a rules config to `withBridgeAuth` in `middleware.ts`. The middleware handles navigation guards automatically, before a request ever reaches a page.

<Tabs>
<TabItem label="middleware.ts">

```ts
// middleware.ts
import { withBridgeAuth } from '@nebulr-group/bridge-nextjs/server';

export default withBridgeAuth({
  rules: [
    { match: '/', public: true },
    { match: new RegExp('^/auth($|/)'), public: true },
  ],
  defaultAccess: 'protected',
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
```

</TabItem>
<TabItem label="app/auth/oauth-callback/route.ts">

```ts
// app/auth/oauth-callback/route.ts
import { createBridgeCallbackRoute } from '@nebulr-group/bridge-nextjs/server';

// Node.js runtime so the server-side token exchange works reliably.
export const runtime = 'nodejs';

export const GET = createBridgeCallbackRoute({
  redirectPath: '/',
  errorRedirectPath: '/?error=auth_failed',
});
```

</TabItem>
</Tabs>

**How it works:**

| Option | What it does |
|--------|--------------|
| `defaultAccess` | Sets whether unmatched routes are `'public'` or `'protected'`. |
| `rules` | Marks individual paths as public. String rules match the exact path or any subpath; RegExp rules use `pattern.test(pathname)`. |
| `callbackPath` | The OAuth callback path, always treated as public. Defaults to `/auth/oauth-callback`; it must resolve to a Route Handler built with `createBridgeCallbackRoute` (second tab above). |

Redirects are handled automatically by the middleware: when a protected route is hit without a valid session, the user is sent to Bridge's hosted login page, and the callback route stores the resulting session before redirecting them back in. For the full `RouteRule` shape, see the [config reference](/auth/config/#route-guard-config).

> **Framework note:** `withBridgeAuth` runs on the server and reads the session from cookies, which are set by the hosted-login callback route. If your app signs users in with the drop-in `LoginForm` instead (SDK auth stores tokens in `localStorage`, invisible to middleware), gate pages client-side with `<ProtectedRoute>` and set `defaultAccess: 'public'` in the middleware:
>
> ```tsx
> 'use client';
> import { ProtectedRoute } from '@nebulr-group/bridge-nextjs/client';
>
> export default function DashboardPage() {
>   return (
>     <ProtectedRoute redirectTo="/auth/login">
>       <Dashboard />
>     </ProtectedRoute>
>   );
> }
> ```
>
> `<ProtectedRoute>` shows a loading placeholder while auth state resolves, redirects to `redirectTo` (default `'/'`) if the user isn't authenticated, and renders `children` otherwise.

> **Framework note:** flag-gated route rules (`featureFlag` / `redirectTo` on a rule) are not enforced by `withBridgeAuth` yet. To gate routes behind feature flags in middleware today, compose `withFeatureFlags` with `withBridgeAuth`:
>
> ```ts
> // middleware.ts
> import { NextRequest } from 'next/server';
> import { withBridgeAuth, withFeatureFlags } from '@nebulr-group/bridge-nextjs/server';
>
> const authMiddleware = withBridgeAuth({
>   rules: [
>     { match: '/', public: true },
>     { match: new RegExp('^/auth($|/)'), public: true },
>   ],
>   defaultAccess: 'protected',
> });
>
> const flagMiddleware = withFeatureFlags([
>   { flag: 'beta_feature', paths: ['/beta', '/beta/*'], redirectTo: '/' },
> ]);
>
> export default async function middleware(request: NextRequest) {
>   const authResult = await authMiddleware(request);
>   if (authResult.status === 307 || authResult.status === 308) return authResult;
>   return flagMiddleware(request);
> }
>
> export const config = {
>   matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
> };
> ```
