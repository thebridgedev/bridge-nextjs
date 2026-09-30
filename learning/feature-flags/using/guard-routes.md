# Guard routes

Gate entire routes behind flags with `withFeatureFlags` protections in
`middleware.ts`. Middleware runs on the server before a request reaches a
page or API route, so the flag decision is made before the route renders:

```ts
// middleware.ts
import { withFeatureFlags } from '@nebulr-group/bridge-nextjs/server';

export default withFeatureFlags([
  { flag: 'premium-feature', paths: ['/premium/*'], redirectTo: '/upgrade' },
  { flag: 'beta-feature', paths: ['/beta', '/beta/*'], redirectTo: '/' },
]);

export const config = {
  matcher: ['/premium/:path*', '/beta/:path*'],
};
```

Each protection names a flag, the paths it guards (exact, or a `/*` suffix for
any subpath), and where to redirect when the flag is off. Requests under
`/api/*` (or with an `application/json` Accept header) get a JSON error
instead of a redirect; set `responseType: 'error'` to force the JSON path for
a page route too. The `config.matcher` export is standard Next.js middleware
config: it controls which paths the middleware runs on at all, so keep it
aligned with your `paths`.

A flag protection is evaluated by the SDK's middleware on every request,
before the route renders, against the same flag rules the rest of the SDK
uses (read server-side through a short-lived pull cache). It's independent of
the in-component `useFlag` / `<FeatureFlag>` surface. The middleware manages
that flag cache internally, so no extra setup is needed: declare the
protection and the middleware redirects when the flag is off.

> **Framework note:** Next.js runs one `middleware.ts`. If your app also
> uses `withBridgeAuth` for sign-in, do not add `withFeatureFlags` beside it:
> put the flag on a `withBridgeAuth` rule instead,
> `{ match: '/beta', featureFlag: 'beta_feature' }` (signed-in user, flag off →
> `403`). See [Sign-in and a feature flag on the same route](/auth/securing/route-guards/#sign-in-and-a-feature-flag-on-the-same-route).
> `withFeatureFlags` on its own is for an app with no sign-in middleware.

Route rules can also guard on authentication state; see
[Route guards](/auth/securing/route-guards/) in the Auth section for the full
`RouteRule` reference and the composition pattern.

> **Security note:** `x-bridge-context` is internal: the SDK builds it from the verified session token only, removes any copy a client sends on every middleware path and in `requireFeatureFlagForRoute`, and never reads an inbound one. A backend must not trust it on a request that could have come straight from a browser.
