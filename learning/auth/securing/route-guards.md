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

### Which layer guards what

| Your app signs in with | Guarded by | What `withBridgeAuth` does |
|---|---|---|
| Hosted login (no `loginRoute`): the session is a cookie | `withBridgeAuth`, before the page loads | Enforces every route that needs a session: an unmatched route under `defaultAccess: 'protected'`, and any rule without `public: true` under either `defaultAccess`. It verifies the session token: its PS256 signature against the Bridge JWKS (`<apiBaseUrl>/auth/.well-known/jwks.json`), issuer `<apiBaseUrl>/auth`, audience containing your `appId`, and expiry. A missing, forged, foreign or expired token counts as signed out: a page is redirected to login with the page they asked for remembered, an API request gets `401`. If the check itself fails (for example the key set cannot be fetched), the request is denied. |
| The drop-in `LoginForm` (`loginRoute` set): tokens live in the browser | `<ProtectedRoute>` in each protected page, and your API | Steps aside. It cannot see a browser-held session, and redirecting would loop a signed-in user, so a request without a Bridge session cookie is let through. In development it logs a one-time warning saying so. |

Neither route guard replaces server-side authorization. They decide what the browser is shown; every API route must still verify the user's token itself. In SDK-auth mode the middleware is not a guard at all.

The middleware also removes any `x-bridge-context` header a client sends before the request reaches your app; the SDK only ever forwards one it built from the verified session.

Rules are matched against both the requested path and its normalised form (percent-decoding, duplicate slashes, `.`/`..` segments, trailing slash); the stricter answer wins. Matching is case-sensitive, like Next.js routing.

In an SDK-auth app, wrap each protected page:

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

`<ProtectedRoute>` shows a loading placeholder while auth state resolves, redirects to `redirectTo` (default `'/'`) if the user isn't authenticated, and renders `children` otherwise.

> **Framework note:** a rule with `featureFlag` is evaluated by `withBridgeAuth` for the signed-in user and answers `403` when the flag is off. To redirect instead, or to gate whole path trees, compose `withFeatureFlags` with `withBridgeAuth`:
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

## Returning to the page they asked for

Someone who follows a link into a protected page — an emailed document link, a
bookmark, a shared URL — lands on that page after signing in, not on your
default route. This is on by default; you do not configure anything to get it.

How the target travels depends on which login you use:

| Mode | Mechanism | Your job |
|------|-----------|----------|
| **Hosted** (no `loginRoute`) | An `httpOnly` cookie, written by `withAuth` and consumed by `createBridgeCallbackRoute` | Nothing. It is automatic |
| **SDK** (you set `loginRoute`) | `?redirectUri=` on your own login route | Read it after login — below |

Next.js uses a cookie rather than `sessionStorage` because both ends of the
hosted round-trip run on the server: `withAuth` is middleware and the callback
is a route handler, so neither has a DOM. The cookie is `httpOnly`,
`sameSite=lax` (so it survives the top-level navigation back from the identity
provider), and short-lived.

### SDK mode: read it on your login page

Your login page owns the post-login navigation, so it has to read the target.
Use `readReturnTo` — it validates the value for you:

```tsx
'use client';
import { LoginForm, readReturnTo } from '@nebulr-group/bridge-nextjs/client';
import { useRouter, useSearchParams } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const params = useSearchParams();

  return (
    <LoginForm
      onLogin={() => {
        // Falls back to your own default when there is no target, or when the
        // one supplied is not safe to navigate to.
        router.push(readReturnTo(params) ?? '/dashboard');
      }}
    />
  );
}
```

:::caution[Do not read the parameter yourself]
`?redirectUri=` arrives in the URL, so **whoever wrote the link controls it**.
Navigating to it unchecked is an open redirect: a link carrying
`?redirectUri=https://example.invalid` would bounce your users off-site, still
looking like it came from you. Phishing works well from there.

`readReturnTo` rejects anything that is not a same-origin path — absolute URLs,
protocol-relative `//host`, backslash variants, and control characters — and
returns `null` instead, which is why the `??` fallback above is all you need.
If you must handle the value yourself, run it through `sanitizeReturnTo` first.
:::

### Keeping auth routes out of it

Your `loginRoute` is excluded automatically, so a bounce through the login page
never comes back pointing at itself. Exclude the rest of your auth flow too:

```tsx
<BridgeProvider
  config={{
    appId: '…',
    loginRoute: '/auth/login',
    returnTo: { exclude: [new RegExp('^/auth($|/)')] },
  }}
>
```

### Turning it off

To send every login to the same place regardless of where the visitor was
heading:

```tsx
returnTo: { enabled: false }
```

A path that fails validation is treated the same way: your login page gets
`null` and falls back to its own default.
