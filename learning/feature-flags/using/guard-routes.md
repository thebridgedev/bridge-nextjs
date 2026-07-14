# Guard routes

Gate entire routes behind flags in `middleware.ts`. Middleware runs before a
request reaches a page or API route, so a flag decision is made server-side —
users never get a flash of gated content, and API routes never execute their
handler when the flag is off.

## Protecting routes with `withFeatureFlags`

```ts
// middleware.ts
import { withFeatureFlags } from '@nebulr-group/bridge-nextjs/server';

export const middleware = withFeatureFlags([
  { flag: 'beta_dashboard', paths: ['/beta', '/beta/*'], redirectTo: '/' },
  { flag: 'beta_api', paths: ['/api/beta/*'], responseType: 'error', errorStatus: 403 },
]);

export const config = {
  matcher: ['/beta/:path*', '/api/beta/:path*'],
};
```

Each entry is a `FeatureFlagProtection`:

| Field | Type | Description |
|---|---|---|
| `flag` | `string` | The flag key to evaluate |
| `paths` | `string[]` | Paths this rule covers — exact (`/beta`) or prefix wildcard (`/beta/*`) |
| `redirectTo` | `string` | Where to send users when the flag is off (page routes; defaults to `/`) |
| `responseType` | `'redirect' \| 'error'` | Force a JSON error instead of a redirect |
| `errorStatus` | `number` | HTTP status for the error response (default `403`) |
| `errorMessage` | `string` | Custom error body message |

Requests under `/api/*` (or with an `application/json` Accept header) get a JSON
error automatically; page routes redirect. Set `responseType: 'error'` to force
the JSON path for a page route too.

The `config.matcher` export is standard Next.js middleware config — it controls
which paths the middleware runs on at all. Keep it aligned with your `paths` so
the middleware only wakes for routes it actually guards.

## Single-flag convenience wrappers

For one flag whose paths are already scoped by the matcher:

```ts
// middleware.ts — redirect a page route when the flag is off
import { requireFeatureFlag } from '@nebulr-group/bridge-nextjs/server';

export const middleware = requireFeatureFlag('beta_dashboard', '/');
export const config = { matcher: ['/beta/:path*'] };
```

```ts
// middleware.ts — return a JSON 403 for an API route when the flag is off
import { requireApiFeatureFlag } from '@nebulr-group/bridge-nextjs/server';

export const middleware = requireApiFeatureFlag('beta_api');
export const config = { matcher: ['/api/beta/:path*'] };
```

`withFeatureFlag(flagName, options)` is the lower-level single-flag form both of
these build on.

## Composing with auth route guards

`withBridgeAuth` (the auth route guard) and `withFeatureFlags` are separate
layers — compose them in one `middleware.ts` when a route needs both a login
check and a flag check:

```ts
// middleware.ts
import { NextRequest } from 'next/server';
import { withBridgeAuth, withFeatureFlags } from '@nebulr-group/bridge-nextjs/server';

const authMiddleware = withBridgeAuth({
  rules: [
    { match: '/', public: true },
    { match: /^\/auth($|\/)/, public: true },
  ],
  defaultAccess: 'protected',
});

const flagMiddleware = withFeatureFlags([
  { flag: 'beta_dashboard', paths: ['/beta', '/beta/*'], redirectTo: '/' },
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

See [Route guards](/auth/securing/route-guards/) for the auth layer in detail.

## Context propagation

When a guarded request passes, the middleware also serializes the eval context
onto the `x-bridge-context` request header, so any Bridge backend
(nestjs / express) the request flows to buckets the same identity. See [Use
flags on your backend](/feature-flags/using/backend/).

> **Tip:** `withBridgeAuth`'s own `featureFlag` rule field is reserved for
> shape-parity but is not yet enforced — use `withFeatureFlags` (as above) for
> flag-gated routing today.
