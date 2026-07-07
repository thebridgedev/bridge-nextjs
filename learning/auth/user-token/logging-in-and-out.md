---
title: Logging in and logging out
description: How Bridge's JWT-based session works, and how to log a user out.
sidebar:
  label: Next.js
---

# Logging in and logging out

Bridge auth is **JWT-based**. Signing in gets the browser a token set (`accessToken`, `refreshToken`, `idToken`). Everything else — staying signed in across reloads, staying signed in across tabs, silently refreshing before expiry — follows from that one fact.

bridge-nextjs actually keeps **two** copies of this token set, for two different runtimes:

- **The client session** — held by the auth-core singleton that `<BridgeProvider>` initializes in the browser. This is what `useAuth()`, `useProfile()`, `bridge.user`, and every SDK auth component (`LoginForm`, `SsoButton`, etc.) read and write.
- **The `bridge_access_token` / `bridge_refresh_token` / `bridge_id_token` cookies** — written by the OAuth callback route (`createBridgeCallbackRoute`, see [Route guards](/auth/securing/route-guards/)) so that `middleware.ts`, Server Components, and `<ServerFeatureFlag>` — which run before any browser JavaScript executes — can check authentication too.

For most apps this is invisible: sign-in and sign-out through the SDK components keep both in sync in the common case. Keep the split in mind if you build fully custom login/logout flows, since it means there are two things to clear on logout (see below).

## How logging in works

`<BridgeProvider>` initializes the client session synchronously on first render (not inside a `useEffect`), so a page reload never bounces a signed-in user back to login while the app decides what to do:

- **A token is there** — the app starts as authenticated immediately, then quietly refreshes it in the background if it's close to expiring.
- **No token is there** — `authState` starts at `'unauthenticated'` and the sign-in flow takes over (see [Sign-in methods](/auth/sign-in/email-password/) and [Auth states](/auth/user-token/auth-states/)).

If a refresh ever fails (the refresh token itself has expired or been revoked), Bridge clears the client session and drops the user back to `'unauthenticated'` — the same as an explicit logout.

## Logging out

Use `useAuth()`'s `logout()`:

```tsx
'use client';
import { useAuth } from '@nebulr-group/bridge-nextjs/client';
import { useRouter } from 'next/navigation';

export function LogoutButton() {
  const { logout } = useAuth();
  const router = useRouter();

  async function handleLogout() {
    await logout();
    router.push('/');
  }

  return <button onClick={handleLogout}>Log out</button>;
}
```

`logout()` clears the client session (tokens, profile, flags) and resets `authState` to `'unauthenticated'` — it does **not** redirect the browser itself, so navigate away yourself afterward (`router.push`, a `<Link>`, whatever fits your app). This is a deliberate difference from bridge-svelte's `logout({ redirectTo })`, which does a hard redirect to Bridge's hosted logout page; bridge-nextjs's SDK-auth flow keeps logout a local, in-app action instead.

### Also clearing the server-side cookies

`logout()` only clears the client session — it doesn't touch the `bridge_access_token` / `bridge_refresh_token` / `bridge_id_token` cookies written at login. If your app relies on `withBridgeAuth` middleware or `<ServerFeatureFlag>` for server-side checks, clear those too so a stale cookie doesn't leave a "logged out" user still passing server-side auth. `TokenServiceServer` (from `@nebulr-group/bridge-nextjs/server`) is the same class the middleware uses to write them:

```ts
// app/auth/logout/route.ts
import { NextResponse } from 'next/server';
import { TokenServiceServer } from '@nebulr-group/bridge-nextjs/server';

export async function GET(request: Request) {
  const response = NextResponse.redirect(new URL('/', request.url));
  TokenServiceServer.getInstance().clearTokensServer(response);
  return response;
}
```

Send the browser there after calling `logout()` (or use it as your logout action directly) so both copies of the session are cleared together.
