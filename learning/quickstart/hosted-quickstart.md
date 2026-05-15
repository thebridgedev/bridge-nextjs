# Quickstart — Hosted Auth

This is the fastest way to add Bridge authentication to a Next.js app. Users are redirected to the bridge hosted login page; they return with valid tokens.

## 1. Install

```bash
npm install @nebulr-group/bridge-nextjs
```

## 2. Set env vars

`.env.local`:

```env
NEXT_PUBLIC_BRIDGE_APP_ID=your-app-id
```

## 3. Wire the root layout

`app/layout.tsx`:

```tsx
import { BridgeProvider } from '@nebulr-group/bridge-nextjs/client';
import '@nebulr-group/bridge-nextjs/styles';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <BridgeProvider>{children}</BridgeProvider>
      </body>
    </html>
  );
}
```

## 4. Create the OAuth callback route

`app/auth/oauth-callback/route.ts`:

```ts
import { createBridgeCallbackRoute } from '@nebulr-group/bridge-nextjs/server';
export const GET = createBridgeCallbackRoute({ redirectPath: '/' });
```

## 5. Add login + logout

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

## 6. Configure the Bridge app

Set the callback URL to `{origin}/auth/oauth-callback` in the Bridge admin UI.

## 7. Run it

```bash
npm run dev
```

Click sign in → you'll be redirected to bridge hosted auth → return signed in.

## Next steps

- [Protect routes](../auth/auth.md#route-protection)
- [Read user profile](../auth/auth.md#accessing-the-profile)
- [Feature flags](../feature-flags/feature-flags.md)
