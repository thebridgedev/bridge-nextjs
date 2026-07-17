---
title: Configurations
description: The BridgeConfig options you pass to BridgeProvider and middleware, and the app settings managed in Control Center.
sidebar:
  label: Next.js
---
import { Tabs, TabItem } from '@astrojs/starlight/components';

# Configurations

The config object you pass to `<BridgeProvider>` controls how Bridge wires up auth, routing, and billing in your app. See [all config options](#all-config-options) for the full list.

## Passing configs to Bridge

Wrap your app in `<BridgeProvider>` from your root `app/layout.tsx`, passing it a `BridgeConfig` object. The app ID comes from Control Center (your admin dashboard at app.thebridge.dev): open your app's settings and copy its ID into your `.env`.

```tsx
// components/Providers.tsx
'use client';

import { BridgeProvider, type BridgeConfig } from '@nebulr-group/bridge-nextjs/client';
import { useMemo, type ReactNode } from 'react';

export function Providers({ children }: { children: ReactNode }) {
  // Memoize so the config object identity is stable across renders.
  const config = useMemo<Partial<BridgeConfig>>(
    () => ({
      appId: process.env.NEXT_PUBLIC_BRIDGE_APP_ID,
      loginRoute: '/auth/login',
    }),
    [],
  );

  return <BridgeProvider config={config}>{children}</BridgeProvider>;
}

// app/layout.tsx
import { Providers } from '../components/Providers';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

Signature:

```tsx
<BridgeProvider
  appId?: string          // just the appId as a prop, or:
  config?: BridgeConfig   // the full config object
>
  {children}
</BridgeProvider>
```

Bootstrap is idempotent: rendering the provider again after it has completed is a no-op.

> **Framework note:** the root `app/layout.tsx` is a Server Component, so define the config object inside a client component (like the `Providers` wrapper above) rather than as an inline object prop in the layout. Runtime-only nested fields (like `billing`) don't serialize reliably across the Server to Client boundary.

## Callback URL

`callbackUrl` is the URL Bridge calls back to once a login completes. If you omit it, the default callback URL set in Control Center is used instead.

Passing a specific `callbackUrl` lets you send different parts of your app through different post-login destinations, for example an admin section and a regular user section of the same app, or entirely separate apps sharing one Bridge project.

Whatever you pass here must already be registered as an allowed redirect URI in Control Center (see [Configs managed in Control Center](#configs-managed-in-control-center)); Bridge only redirects to callback URLs it's been told about.

```tsx
const config: Partial<BridgeConfig> = {
  appId: process.env.NEXT_PUBLIC_BRIDGE_APP_ID,
  callbackUrl: `${window.location.origin}/admin/oauth-callback`,
};
```

## Base URLs

Two options point the SDK at Bridge itself. You only change them if you're on a dedicated or self-hosted Bridge environment; on the standard cloud, leave them alone.

- **`apiBaseUrl`** (default `https://api.thebridge.dev`): the base URL for the Bridge API. Every API endpoint the SDK calls is derived from it.
- **`hostedUrl`** (default `https://auth.thebridge.dev`): the base URL for Bridge's hosted UI, such as the hosted login page and plan selection.

## Login route

If you set `loginRoute`, unauthenticated users who hit a protected route are redirected to that in-app route, where your own login page (for example, one built with [`LoginForm`](/auth/ui/email-password/)) takes over.

If you leave `loginRoute` unset, Bridge uses hosted auth instead: unauthenticated users are redirected to Bridge's hosted login page (served from `hostedUrl`). Unset is the default, so hosted login is what you get out of the box.

> **Framework note:** in Next.js the redirect to an in-app login page is performed client-side by `<ProtectedRoute redirectTo="/auth/login">`; the server-side `withBridgeAuth` middleware always redirects to the hosted login page. See [Route guards](/auth/securing/route-guards/).

## All config options

| Option | Type | Default | Description |
|--------|------|---------|--------------|
| `appId` | `string` | (required) | Your Bridge app ID, found in your app's settings in Control Center |
| `apiBaseUrl` | `string` | `'https://api.thebridge.dev'` | Base URL for the Bridge API; all endpoints are derived from it. See [Base URLs](#base-urls) |
| `hostedUrl` | `string` | `'https://auth.thebridge.dev'` | Base URL for Bridge's hosted UI (login page, plan selection). See [Base URLs](#base-urls) |
| `callbackUrl` | `string` | `${origin}/auth/oauth-callback` | Where the login flow redirects back to after a successful login. See [Callback URL](#callback-url) |
| `defaultRedirectRoute` | `string` | `'/'` | Route to redirect to after login |
| `loginRoute` | `string` | (unset) | In-app route of your login page. Leave unset for hosted auth: without it, unauthenticated users go to Bridge's hosted login page. See [Login route](#login-route) |
| `signupRoute` | `string` | `'/auth/signup'` | Route where your signup page lives; `LoginForm`'s signup link points here unless its `signupHref` prop overrides it |
| `billing.paywallRoute` | `string` | (none) | Route to redirect to when the workspace (called a *tenant* in the API) has no plan selected |
| `billing.paymentErrorRoute` | `string` | `'/payment-error'` | Route to redirect to when a Stripe checkout confirmation fails |
| `storage` | `TokenStorage` | `localStorage` (browser) / memory (SSR) | Token storage adapter; implement `get`/`set`/`remove` to bring your own |
| `debug` | `boolean` | `false` | Enable debug logging |

## Route guard config

Route rules are declared in `middleware.ts` via `withBridgeAuth`, which marks routes public or protected:

```typescript
interface WithBridgeAuthOptions {
  rules?: RouteRule[];
  /** Access for routes no rule matches. @default 'protected' */
  defaultAccess?: 'public' | 'protected';
  /** OAuth callback path, always treated as public. @default '/auth/oauth-callback' */
  callbackPath?: string;
}

interface RouteRule {
  /** Path to match: exact string (also matches subpaths) or RegExp. */
  match: string | RegExp;
  /** Route is accessible without authentication. */
  public?: boolean;
}
```

See [Route guards](/auth/securing/route-guards/) for a walkthrough.

## Passing values via .env

> **Tip:** this is just a best practice, not a requirement. Keep environment-specific values in a `.env` file instead of hardcoding them, and read them with `process.env` when you build the config. The `NEXT_PUBLIC_` prefix is required for values to reach the browser; the SDK reads the `NEXT_PUBLIC_BRIDGE_*` variables below automatically, and they take precedence over values passed via the `config` prop.

<Tabs>
<TabItem label=".env">

```env
NEXT_PUBLIC_BRIDGE_APP_ID=your-app-id-here
NEXT_PUBLIC_BRIDGE_LOGIN_ROUTE=/auth/login
NEXT_PUBLIC_BRIDGE_DEFAULT_REDIRECT_ROUTE=/dashboard
```

</TabItem>
<TabItem label="Providers.tsx">

```tsx
// Only needed for values without a NEXT_PUBLIC_BRIDGE_* variable
// (e.g. billing routes); the ones above are picked up automatically.
const config: Partial<BridgeConfig> = {
  billing: { paywallRoute: '/welcome' },
  debug: process.env.NODE_ENV === 'development',
};
```

</TabItem>
</Tabs>

The SDK reads `NEXT_PUBLIC_BRIDGE_APP_ID`, `NEXT_PUBLIC_BRIDGE_API_BASE_URL`, `NEXT_PUBLIC_BRIDGE_CALLBACK_URL`, `NEXT_PUBLIC_BRIDGE_DEFAULT_REDIRECT_ROUTE`, `NEXT_PUBLIC_BRIDGE_LOGIN_ROUTE`, `NEXT_PUBLIC_BRIDGE_SIGNUP_ROUTE`, and `NEXT_PUBLIC_BRIDGE_DEBUG`. The server-side helpers (`withBridgeAuth`, `getConfig()`) read the same variables independently, so keep the values identical between the client bundle and the server process (the same `.env` file, deployed consistently).

## Configs managed in Control Center

Some settings aren't passed in code at all. They're set once per app, and Bridge enforces them server-side:

| Setting | What it does |
|---------|---------------|
| Redirect URIs | The allowlist of callback URLs Bridge is allowed to redirect to. Any `callbackUrl` you pass to `<BridgeProvider>` must already be on this list. |
| Allowed origins | The CORS allowlist: origins permitted to call the Bridge API directly from the browser. |
| Default callback URL | Used whenever your app doesn't pass a `callbackUrl` in code. See [Callback URL](#callback-url). |

- **CLI:**

  ```bash
  bridge app update \
    --redirect-uris "https://app.example.com/oauth-callback,https://admin.example.com/oauth-callback" \
    --allowed-origins "https://app.example.com,https://admin.example.com" \
    --default-callback-uri "https://app.example.com/oauth-callback"
  ```

- **Control Center:** the same settings, managed from your app's settings.
- **MCP (AI-assistant integration):** coming soon.
