---
title: Getting the user token
description: Read the signed-in user's identity, the recommended way and the alternatives.
sidebar:
  label: Next.js
---

# Getting the user token

The user's token is set the moment they sign in (through `LoginForm`, `SsoButton`, a passkey, magic link, or however your app authenticates them) and Bridge keeps it valid from then on. You never fetch or store it yourself.

## The recommended path: the unified `bridge` object

For almost everything you build, read the signed-in user from `bridge.user`. It's live, reactive, and requires no setup beyond `<BridgeProvider>`:

```tsx
'use client';
import { useBridge, useBridgeReadable } from '@nebulr-group/bridge-nextjs/client';

export function UserBadge() {
  const bridge = useBridge();
  const user = useBridgeReadable(bridge.user);

  if (!user) return null;
  return <p>{user.email} ({user.role})</p>;
}
```

`bridge.user` exposes:

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | The user's unique identifier |
| `email` | `string \| undefined` | The user's email |
| `role` | `string` | The user's role within the current workspace (a workspace is called a *tenant* in the API, hence the next field's name) |
| `tenantId` | `string` | The current workspace's ID |

It's populated from the session snapshot sent over the live channel (a persistent realtime connection the SDK maintains) on connect and every reconnect, so it's always current. See [How the user token is updated](/auth/user-token/object-updates/).

> **Framework note:** `useBridge()` and `useBridgeReadable()` are client-only (`'use client'` boundary required). `bridge.user` is backed by a realtime channel that only connects in the browser, so reading it from a Server Component always resolves to `null`; see [Reading the token on the server](#reading-the-token-on-the-server) for that side.

## A one-off imperative read: `getCurrentUser()`

For a single read outside a reactive context (a plain function, an event handler, an analytics call), `bridge.user` is overkill if you don't want to set up a subscription just to read a value once. `getBridgeAuth().getCurrentUser()` reads the same claims synchronously, straight off the current access token, no subscription required:

```ts
import { getBridgeAuth } from '@nebulr-group/bridge-nextjs/client';

const user = getBridgeAuth().getCurrentUser();
// { id, email?, role?, tenantId?, plan? } | null
```

It returns `null` when there's no valid token. Unlike `bridge.user`, it also includes `plan` (the workspace's plan key), so it's a reasonable choice when you need that alongside identity in one synchronous call. It won't update on its own the way `bridge.user` does; call it again to get a fresh read.

## Richer profile fields: `useProfile()`

`bridge.user` is intentionally minimal. For display fields like full name, avatar-worthy details, or workspace name/logo, use `useProfile()`:

```tsx
'use client';
import { useProfile } from '@nebulr-group/bridge-nextjs/client';

export function ProfileCard() {
  const { profile } = useProfile();

  if (!profile) return null;
  return (
    <div>
      <h2>{profile.fullName}</h2>
      <p>{profile.email}</p>
    </div>
  );
}
```

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | The user's unique identifier |
| `username` | `string` | Username |
| `email` | `string` | Email |
| `emailVerified` | `boolean` | Email verification status |
| `fullName` | `string` | Full display name |
| `givenName` / `familyName` | `string \| undefined` | First / last name |
| `locale` | `string \| undefined` | The user's locale |
| `onboarded` | `boolean \| undefined` | Whether onboarding is complete |
| `multiTenantAccess` | `boolean \| undefined` | Whether the user can access more than one workspace |
| `tenant` | `{ id, name, locale?, logo?, onboarded? } \| undefined` | The current workspace's details |

Unlike `bridge.user`, the profile isn't refreshed automatically when something changes server-side. Call the `updateProfile()` function returned by `useProfile()` to re-fetch it on demand (for example, right after the user edits their name).

The `profile` value is `undefined` while loading, `null` when not authenticated, and a profile object when authenticated.

### Just rendering the name: `ProfileName`

If all you need is the user's display name somewhere in your UI, skip the hook and drop in the ready-made component:

```tsx
'use client';
import { ProfileName } from '@nebulr-group/bridge-nextjs/client';

export function Header() {
  return <ProfileName />;
  // renders: "John Doe" or "john@example.com" or nothing when not authenticated
}
```

It outputs a `<span>` with a `data-bridge-profile-name` attribute for styling, and accepts `className` and `style` props. No configuration needed.

## The alternative path: `useBridgeTokens()`

You almost never need this. Bridge's own SDK calls already carry the token automatically; every `fetch()` to the Bridge API gets `Authorization: Bearer <token>` injected for you.

Reach for `useBridgeTokens()` only when you're calling a backend you control that isn't Bridge's API, and it also needs to verify the user:

```tsx
'use client';
import { useBridgeTokens } from '@nebulr-group/bridge-nextjs/client';

export function useMyBackendCall() {
  const tokens = useBridgeTokens();

  return async () =>
    fetch('https://your-own-api.example.com/work', {
      headers: { Authorization: `Bearer ${tokens?.accessToken}` },
    });
}
```

`useBridgeTokens()` returns `{ accessToken, refreshToken, idToken }`, the raw JWTs (or `null` when unauthenticated). Bridge refreshes them automatically before they expire, and proactively after your app reconnects from being offline, so you never manage token lifetimes yourself.

## Reading the token on the server

> **Framework note:** Server Components, Route Handlers, and `middleware.ts` run outside the browser, so there's no React hook and no realtime channel there. If your app uses the hosted-login flow, the OAuth callback route writes the access token to a `bridge_access_token` cookie, and `TokenServiceServer` (from `@nebulr-group/bridge-nextjs/server`) reads it back; it's the same class `withBridgeAuth` uses internally:
>
> ```ts
> // app/api/whoami/route.ts
> import { cookies } from 'next/headers';
> import { TokenServiceServer } from '@nebulr-group/bridge-nextjs/server';
>
> export async function GET() {
>   const cookieStore = await cookies();
>   const cookieHeader = cookieStore.getAll().map((c) => `${c.name}=${c.value}`).join('; ');
>
>   const accessToken = TokenServiceServer.getInstance().getAccessTokenServer(cookieHeader);
>   return Response.json({ hasToken: !!accessToken });
> }
> ```
>
> `TokenServiceServer` exposes the access token as a raw JWT string; if you need role/tenant claims server-side, decode the JWT yourself.
