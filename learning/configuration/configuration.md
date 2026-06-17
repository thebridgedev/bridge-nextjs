# Configuration Reference

### BridgeConfig type

The config object you can pass to `<BridgeProvider config={...}>` (every field is also settable via a `NEXT_PUBLIC_BRIDGE_*` env var — see below). It extends auth-core's `BridgeAuthConfig`:

```typescript
interface BridgeConfig {
  /** Your Bridge application ID (required) */
  appId: string;

  /** Where the login flow redirects back to.
   *  @default `${window.location.origin}/auth/oauth-callback` */
  callbackUrl?: string;

  /** Base URL for the Bridge API. All endpoints are derived from this.
   *  @default 'https://api.thebridge.dev' */
  apiBaseUrl?: string;

  /** Route to redirect to after login. @default '/' */
  defaultRedirectRoute?: string;

  /** In-app route of your login page. Leave unset for hosted auth —
   *  without it, unauthenticated users go to the Bridge hosted login page. */
  loginRoute?: string;

  /** In-app route of your signup page (SDK auth). */
  signupRoute?: string;

  /** Enable debug logging. @default false */
  debug?: boolean;
}
```

### Wiring `<BridgeProvider>`

Wrap your app once in the root `app/layout.tsx`. The provider reads `NEXT_PUBLIC_BRIDGE_APP_ID` from the environment automatically, so the zero-config form is usually all you need:

```tsx
// app/layout.tsx
import { BridgeProvider } from '@nebulr-group/bridge-nextjs/client';
import '@nebulr-group/bridge-nextjs/styles';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {/* Reads NEXT_PUBLIC_BRIDGE_APP_ID from env */}
        <BridgeProvider>{children}</BridgeProvider>
      </body>
    </html>
  );
}
```

To pass config explicitly instead of (or in addition to) env vars:

```tsx
<BridgeProvider config={{ appId: 'your-app-id', loginRoute: '/auth/login' }}>
  {children}
</BridgeProvider>
```

`<BridgeProvider>` initializes the Bridge runtime synchronously on the first client render and is idempotent — a second provider instance reuses the existing singleton.

### Route protection — `middleware.ts`

Declare which routes are public, protected, or flag-gated with `withBridgeAuth` in `middleware.ts`:

```typescript
// middleware.ts
import { withBridgeAuth } from '@nebulr-group/bridge-nextjs/server';

export default withBridgeAuth({
  rules: [
    { match: '/', public: true },
    { match: /^\/auth($|\/)/, public: true },
    { match: '/beta', featureFlag: 'beta-access', redirectTo: '/' },
  ],
  defaultAccess: 'protected',
});

export const config = { matcher: ['/((?!_next|api|.*\\..*).*)'] };
```

`RouteRule`:

```typescript
interface RouteRule {
  /** Path to match — exact string or RegExp. */
  match: string | RegExp;
  /** Route is accessible without authentication. */
  public?: boolean;
  /** Require feature flag(s): a key, { any: [...] }, or { all: [...] }. */
  featureFlag?: string | { any: string[] } | { all: string[] };
  /** Where to send users who fail the featureFlag requirement. */
  redirectTo?: string;
}
```

`defaultAccess` controls routes no rule matches (`'protected'` by default). For client-side gating of an individual page, use the `<ProtectedRoute>` component instead — see the Auth guide.

### Passing values via .env

Keep environment-specific values in `.env.local` instead of hardcoding them. The `NEXT_PUBLIC_` prefix is required for values to reach the browser:

```env
NEXT_PUBLIC_BRIDGE_APP_ID=your-app-id-here
NEXT_PUBLIC_BRIDGE_API_BASE_URL=https://api.thebridge.dev
NEXT_PUBLIC_BRIDGE_CALLBACK_URL=http://localhost:3000/auth/oauth-callback
NEXT_PUBLIC_BRIDGE_DEFAULT_REDIRECT_ROUTE=/
NEXT_PUBLIC_BRIDGE_LOGIN_ROUTE=/auth/login
NEXT_PUBLIC_BRIDGE_SIGNUP_ROUTE=/auth/signup
NEXT_PUBLIC_BRIDGE_DEBUG=true
```

`<BridgeProvider>` merges these over its defaults and over any `config` / `appId` props, so env vars win — handy for per-environment overrides without touching code.

### Reading the resolved config at runtime

Read the active config from any client component with `useAppConfig`:

```tsx
'use client';
import { useAppConfig } from '@nebulr-group/bridge-nextjs/client';

export function ConfigBadge() {
  const config = useAppConfig();
  if (!config) return null;
  return (
    <>
      <p>App ID: {config.appId}</p>
      <p>API Base: {config.apiBaseUrl}</p>
    </>
  );
}
```
