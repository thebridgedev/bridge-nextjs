# Bridge Next.js — Integration Prompt

You are integrating **`@nebulr-group/bridge-nextjs`** (the Next.js plugin of the Bridge SDK platform) into a Next.js 15+ App Router project. Follow these steps in order. Do not skip steps.

## Prerequisites

- Next.js **15.x or later** with the **App Router** (`app/` directory).
- React 18+.
- A registered Bridge app — you will need its `appId` (set via `NEXT_PUBLIC_BRIDGE_APP_ID`).
- For SDK auth flows that allow signup, the Bridge app must have **`tenantSelfSignup: true`** enabled on the backend.

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
# Optional overrides (all start with NEXT_PUBLIC_BRIDGE_):
# NEXT_PUBLIC_BRIDGE_API_BASE_URL=https://api.thebridge.dev
# NEXT_PUBLIC_BRIDGE_CALLBACK_URL=http://localhost:3000/auth/oauth-callback
# NEXT_PUBLIC_BRIDGE_DEFAULT_REDIRECT_ROUTE=/
# NEXT_PUBLIC_BRIDGE_LOGIN_ROUTE=/auth/login
# NEXT_PUBLIC_BRIDGE_SIGNUP_ROUTE=/auth/signup
# NEXT_PUBLIC_BRIDGE_DEBUG=true
```

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

`BridgeProvider` automatically reads `NEXT_PUBLIC_BRIDGE_APP_ID` from env. You can also pass `appId` or `config={{...}}` as props.

## Create the OAuth callback route

For hosted-auth (redirect to bridge login), create `app/auth/oauth-callback/route.ts`:

```ts
import { createBridgeCallbackRoute } from '@nebulr-group/bridge-nextjs/server';

export const GET = createBridgeCallbackRoute({
  redirectPath: '/',
});
```

The handler exchanges the OAuth `code` for tokens, sets them in cookies + localStorage, and preserves `?payment=*` on the success redirect (post-payment flows depend on this).

## Configure the Bridge app

In the Bridge admin UI for your app, set:
- **Callback URL:** `http://localhost:3000/auth/oauth-callback` (and your production URL).
- **Default redirect:** `/`.
- For SDK auth flows: enable **`tenantSelfSignup`**, and toggle individual auth methods (magic link, passkeys, password) as needed.

## Add login and logout

```tsx
'use client';
import { useAuth } from '@nebulr-group/bridge-nextjs/client';

export default function AuthControls() {
  const { isAuthenticated, login, logout } = useAuth();
  return isAuthenticated
    ? <button onClick={() => logout()}>Sign out</button>
    : <button onClick={() => login()}>Sign in</button>;
}
```

## Route protection

### Server-side (recommended) — `middleware.ts`

```ts
import { withBridgeAuth } from '@nebulr-group/bridge-nextjs/server';

export default withBridgeAuth({
  rules: [
    { match: '/', public: true },
    { match: '/auth/:path*', public: true },
    { match: '/api/public/:path*', public: true },
    // everything else requires authentication
  ],
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
```

### Client-side — `<ProtectedRoute>`

```tsx
'use client';
import { ProtectedRoute } from '@nebulr-group/bridge-nextjs/client';

export default function DashboardPage() {
  return (
    <ProtectedRoute>
      <Dashboard />
    </ProtectedRoute>
  );
}
```

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
  const token = await getBridgeAuth().getAccessToken();
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
- [ ] `app/auth/oauth-callback/route.ts` created with `createBridgeCallbackRoute`.
- [ ] Bridge app's callback URL set to `{origin}/auth/oauth-callback`.
- [ ] `middleware.ts` (or `<ProtectedRoute>`) guards protected pages.
- [ ] `useAuth().login()` and `useAuth().logout()` wired in the UI.

## Verify the integration

1. Run `npm run dev`.
2. Open `http://localhost:3000`.
3. Click "Sign in" — you should be redirected to bridge hosted auth.
4. Complete login — you should land back on `/` with `isAuthenticated === true`.
5. Click "Sign out" — `isAuthenticated` should flip back to `false`.

If `useAuth` returns the wrong state, check the browser console for `[BridgeProvider]` debug logs (set `NEXT_PUBLIC_BRIDGE_DEBUG=true`).
