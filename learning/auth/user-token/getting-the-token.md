---
title: Getting the user token
description: Read the signed-in user's identity, the recommended way and the alternatives.
sidebar:
  label: Next.js
---

# Getting the user token

The user's token is set the moment they sign in — through `LoginForm`, `SsoButton`, a passkey, magic link, or however your app authenticates them — and Bridge keeps it valid from then on. You never fetch or store it yourself.

Everything on this page is **client-side**: it reads from the live, in-memory Bridge session that `<BridgeProvider>` bootstraps in the browser. For Server Components, Route Handlers, and `middleware.ts`, see [Reading the token on the server](#reading-the-token-on-the-server) below.

## The recommended path: the unified `bridge` surface

For almost everything you build, read the signed-in user from `bridge.user` via `useBridge()` and `useBridgeReadable()` — it's live, reactive, and requires no setup beyond `<BridgeProvider>`:

```tsx
'use client';
import { useBridge, useBridgeReadable } from '@nebulr-group/bridge-nextjs/client';

export function UserBadge() {
  const bridge = useBridge();
  const user = useBridgeReadable(bridge.user);

  if (!user) return null;
  return <p>{user.email} — {user.role}</p>;
}
```

`bridge.user` exposes:

| Field | Type | Description |
|-------|------|--------------|
| `id` | `string` | The user's unique identifier |
| `email` | `string \| undefined` | The user's email |
| `role` | `string` | The user's role within the current tenant |
| `tenantId` | `string` | The current workspace's ID |

It's populated from the live channel's session snapshot on connect and every reconnect, so it's always current — see [How the user token is updated](/auth/user-token/object-updates/).

`useBridge()` and `useBridgeReadable()` are both client-only (`'use client'` boundary required) — `bridge.user` is backed by a realtime channel that only connects in the browser, so reading it from a Server Component always resolves to `null`.

## Richer profile fields: `useProfile()`

`bridge.user` is intentionally minimal. For display fields like full name, avatar-worthy details, or onboarding/multi-tenant status, use `useProfile()`:

```tsx
'use client';
import { useProfile } from '@nebulr-group/bridge-nextjs/client';

export function ProfileCard() {
  const { profile, isLoading } = useProfile();

  if (isLoading || !profile) return null;
  return (
    <div>
      <h2>{profile.fullName}</h2>
      <p>{profile.email}</p>
    </div>
  );
}
```

`useProfile()` returns:

| Field | Type | Description |
|-------|------|--------------|
| `profile` | `Profile \| null \| undefined` | `undefined` while loading, `null` when not authenticated, otherwise the profile |
| `isLoading` | `boolean` | True while Bridge is still loading the profile |
| `error` | `string \| null` | Last profile error, if any |
| `updateProfile` | `() => Promise<Profile \| null>` | Re-fetch the profile on demand |
| `isOnboarded` | `boolean` | Shorthand for `profile?.onboarded` |
| `hasMultiTenantAccess` | `boolean` | Shorthand for `profile?.multiTenantAccess` |

Unlike `bridge.user`, the profile isn't refreshed automatically when something changes server-side — call `updateProfile()` to re-fetch it on demand (for example, right after the user edits their name). `useIsOnboarded()` and `useHasMultiTenantAccess()` are also available as standalone hooks if you only need one field. `<ProfileName />` is a ready-made component that renders the user's full name (falling back to their email) if you just need to display it somewhere, with no wiring:

```tsx
'use client';
import { ProfileName } from '@nebulr-group/bridge-nextjs/client';

export function Header() {
  return <ProfileName className="text-sm font-medium" />;
}
```

## The alternative path: `useBridgeTokens()`

You almost never need this. Bridge's own SDK calls already carry the token automatically — every request `getBridgeAuth()` makes to the Bridge API gets `Authorization: Bearer <token>` injected for you.

Reach for `useBridgeTokens()` only when you're calling a backend you control that isn't Bridge's API, and it also needs to verify the user:

```tsx
'use client';
import { useBridgeTokens } from '@nebulr-group/bridge-nextjs/client';

export function useMyBackendCall() {
  const tokens = useBridgeTokens();

  return async function callMyApi() {
    return fetch('https://your-own-api.example.com/work', {
      headers: { Authorization: `Bearer ${tokens?.accessToken}` },
    });
  };
}
```

`useBridgeTokens()` returns `TokenSet | null` — `{ accessToken, refreshToken, idToken }`, the raw JWTs, or `null` when unauthenticated. Bridge refreshes them automatically before they expire, so you never manage token lifetimes yourself.

## Reading the token on the server

Server Components, Route Handlers, and `middleware.ts` run outside the browser, so there's no React hook and no realtime channel — `bridge.user` doesn't apply there. Instead, Bridge writes the access token to a `bridge_access_token` cookie during the OAuth callback (see [Logging in and logging out](/auth/user-token/logging-in-and-out/)), and reads it back from `next/headers` `cookies()` or the request's `cookie` header.

`withBridgeAuth` (in `middleware.ts`) and `<ServerFeatureFlag>` already do this internally — see [Route guards](/auth/securing/route-guards/). If you need the raw token yourself in a Route Handler or Server Component, `TokenServiceServer` (exported from `@nebulr-group/bridge-nextjs/server`) is the same class they use:

```ts
// app/api/whoami/route.ts
import { cookies } from 'next/headers';
import { TokenServiceServer } from '@nebulr-group/bridge-nextjs/server';

export async function GET() {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.getAll().map((c) => `${c.name}=${c.value}`).join('; ');

  const tokenService = TokenServiceServer.getInstance();
  const accessToken = tokenService.getAccessTokenServer(cookieHeader);

  return Response.json({ hasToken: !!accessToken });
}
```

`TokenServiceServer` exposes the access token as a raw JWT string — it doesn't decode role/tenant claims into a typed object the way `bridge.user` does on the client. If you need those claims server-side, decode the JWT yourself (Bridge uses `jwt-decode` internally for the same purpose).
