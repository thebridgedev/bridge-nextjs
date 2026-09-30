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

Wrap your app in `<BridgeProvider>` from your root `app/layout.tsx`. With the environment set, nothing else is required. The app ID comes from Control Center (your admin dashboard at app.thebridge.dev): open your app's settings and copy its ID into your `.env`.

```env
# .env.local
NEXT_PUBLIC_BRIDGE_APP_ID=your-app-id
```

```tsx
// app/layout.tsx — a Server Component
import { BridgeProvider } from '@nebulr-group/bridge-nextjs/client';
import '@nebulr-group/bridge-nextjs/styles';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <BridgeProvider config={{ loginRoute: '/auth/login' }}>{children}</BridgeProvider>
      </body>
    </html>
  );
}
```

The config is plain data (strings, booleans, nested objects), so the Server Component layout passes it straight to the provider; no client wrapper component is needed. The one exception is a field that holds a function or a component, such as `billing.upgradeDialog: MyDialog`: pass that from a Client Component.

Signature:

```tsx
<BridgeProvider
  appId?: string                 // wins over config.appId and NEXT_PUBLIC_BRIDGE_APP_ID
  config?: Partial<BridgeConfig>
>
  {children}
</BridgeProvider>
```

Bootstrap is idempotent: rendering the provider again after it has completed is a no-op.

### Where each setting comes from

Each field resolves as **explicit option > environment > default**; an empty value counts as unset. The same rule holds in `<BridgeProvider>`, in `withBridgeAuth` and in every server helper, so the browser and the middleware always talk to the same app. `createBridgeConfig(options)` (from `/client` or `/server`) returns the resolved config if you need it yourself.

| Variable | When to set it |
|---|---|
| `NEXT_PUBLIC_BRIDGE_APP_ID` | Always. Missing, Bridge does not start and names the variable |
| `NEXT_PUBLIC_BRIDGE_API_BASE_URL` | Only for a non-production app (stage, local, self-hosted). Unset means production |
| `NEXT_PUBLIC_BRIDGE_HOSTED_URL` | Only for a local or self-hosted Bridge. On Bridge's own domains the hosted pages follow the API address (`api-stage.thebridge.dev` → `auth-stage.thebridge.dev`) |
| `NEXT_PUBLIC_BRIDGE_LOGIN_ROUTE` | For in-app sign-in (same as the `loginRoute` option) |
| `NEXT_PUBLIC_BRIDGE_CALLBACK_URL`, `NEXT_PUBLIC_BRIDGE_DEFAULT_REDIRECT_ROUTE`, `NEXT_PUBLIC_BRIDGE_SIGNUP_ROUTE` | Rarely; the defaults fit the catch-all pages |
| `NEXT_PUBLIC_BRIDGE_DEBUG` | `true` for console logging |

Every variable carries the `NEXT_PUBLIC_` prefix, because Next.js only inlines prefixed variables into the browser bundle.

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
- **`hostedUrl`** (default `https://auth.thebridge.dev`): the base URL for Bridge's hosted UI, such as the hosted login page and plan selection. On Bridge's own domains it follows `apiBaseUrl` (`api-stage` → `auth-stage`), so a stage app sets only its API address. Set it (or `NEXT_PUBLIC_BRIDGE_HOSTED_URL`) only for a local or self-hosted Bridge.

## Login route

If you set `loginRoute`, unauthenticated users who hit a protected route are redirected to that in-app route, where your own login page (for example, one built with [`LoginForm`](/auth/ui/email-password/)) takes over.

If you leave `loginRoute` unset, Bridge uses hosted auth instead: unauthenticated users are redirected to Bridge's hosted login page (served from `hostedUrl`). Unset is the default, so hosted login is what you get out of the box.

> **Framework note:** in Next.js, `LoginForm` sign-ins keep their tokens in the browser, where the `withBridgeAuth` middleware cannot see them, so the redirect to your in-app login page is performed client-side by `<ProtectedRoute redirectTo="/auth/login">`. With `loginRoute` set, the middleware steps aside for requests without a Bridge session cookie; it redirects to `loginRoute` only for a cookie session it can check. See [Route guards](/auth/securing/route-guards/#which-layer-guards-what).

## All config options

| Option | Type | Default | Description |
|--------|------|---------|--------------|
| `appId` | `string` | (required) | Your Bridge app ID, found in your app's settings in Control Center |
| `apiBaseUrl` | `string` | `'https://api.thebridge.dev'` | Base URL for the Bridge API; all endpoints are derived from it. See [Base URLs](#base-urls) |
| `hostedUrl` | `string` | follows `apiBaseUrl` on Bridge's domains, else `'https://auth.thebridge.dev'` | Base URL for Bridge's hosted UI (login page, plan selection). See [Base URLs](#base-urls) |
| `callbackUrl` | `string` | `${origin}/auth/oauth-callback` | Where the login flow redirects back to after a successful login. See [Callback URL](#callback-url) |
| `defaultRedirectRoute` | `string` | `'/'` | Route to redirect to after login |
| `loginRoute` | `string` | (unset) | In-app route of your login page. Leave unset for hosted auth: without it, unauthenticated users go to Bridge's hosted login page. See [Login route](#login-route) |
| `signupRoute` | `string` | `'/auth/signup'` | Route where your signup page lives; `LoginForm`'s signup link points here unless its `signupHref` prop overrides it |
| `billing.paywallRoute` | `string \| false` | `'/subscription/plan'` | Where a signed-in workspace (a *tenant* in the API) with no plan is redirected. The default applies only to an app that has plans; `false` turns the redirect off |
| `billing.paymentErrorRoute` | `string` | `'/subscription/error'` | Where a failed Stripe checkout confirmation lands |
| `billing.manageRoute` | `string` | `'/subscription'` | The subscription page: where Upgrade/Manage buttons and the upgrade dialog link. A completed checkout lands on `<manageRoute>/success` |
| `billing.upgradeDialog` | `boolean \| Component` | `true` | The dialog opened when your backend answers `402 QUOTA_EXCEEDED` or `402 FEATURE_NOT_IN_PLAN`. `false` turns it off (render your own from `useUpgradeRequest()`); a component replaces it |
| `billing.apiOrigins` | `string[]` | (none) | Your backend's origins when it is not on the page's origin, so a plain `fetch` refusal is recognised too (`bridgeFetch` needs no listing) |
| `storage` | `TokenStorage` | `localStorage` (browser) / memory (SSR) | Token storage adapter; implement `get`/`set`/`remove` to bring your own |
| `locale` | `string` | `'en'` | UI language for the SDK auth components, e.g. `'sv'`. Region variants (`'sv-SE'`) resolve to their base language; an unknown locale falls back to English |
| `messages` | `MessageOverrides` | (none) | Per-key copy overrides applied on top of the locale. See [Translating the auth UI](#translating-the-auth-ui) |
| `returnTo.enabled` | `boolean` | `true` | Set `false` to send every login to `defaultRedirectRoute` regardless of where the visitor was heading |
| `returnTo.param` | `string` | `'redirectUri'` | Query parameter carrying the return target in SDK mode |
| `returnTo.exclude` | `(string \| RegExp)[]` | `[]` | Paths that must never become a return target. Your `loginRoute` is excluded automatically |
| `debug` | `boolean` | `false` | Enable debug logging |

## Translating the auth UI

The SDK auth components ship their own copy — field labels, buttons, alerts,
success messages. Set `locale` once and all of it renders in that language:

```tsx
<BridgeProvider config={{ appId: '…', locale: 'sv' }}>
```

Bridge owns the **mechanics**: what a field is, what a button does, what went
wrong. Your app owns **voice and context**: the page title, the subtitle,
anything naming your product. Bridge cannot know those, which is why every
component takes `heading={null}` and `description={null}` so you can write your
own.

Shipping locales: **`en`** and **`sv`**. An unknown locale falls back to English
rather than throwing, and a key missing from a locale falls back to English —
a raw key like `login.submit` never renders.

For a phrase you need worded differently, override it per key:

```tsx
// app-wide
<BridgeProvider config={{ appId: '…', locale: 'sv', messages: { 'login.submit': 'Logga in nu' } }}>

// or one screen only
<LoginForm messages={{ 'login.heading': 'Welcome back' }} />
```

Precedence is component prop → config `messages` → `locale` → English. The
override path also covers any language Bridge does not ship yet.

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
  /** Also require a feature flag (signed-in user; off → 403). */
  featureFlag?: string | { any: string[] } | { all: string[] };
}
```

See [Route guards](/auth/securing/route-guards/) for a walkthrough.

## Passing values via .env

> **Tip:** this is just a best practice, not a requirement. Keep environment-specific values in a `.env` file instead of hardcoding them. The `NEXT_PUBLIC_` prefix is required for values to reach the browser; the SDK reads the `NEXT_PUBLIC_BRIDGE_*` variables below automatically. A value passed in the `config` prop wins over the variable, so the prop is how you deliberately override one page's or one deployment's setting.

<Tabs>
<TabItem label=".env">

```env
NEXT_PUBLIC_BRIDGE_APP_ID=your-app-id-here
NEXT_PUBLIC_BRIDGE_LOGIN_ROUTE=/auth/login
NEXT_PUBLIC_BRIDGE_DEFAULT_REDIRECT_ROUTE=/dashboard
```

</TabItem>
<TabItem label="app/layout.tsx">

```tsx
// Only needed for values without a NEXT_PUBLIC_BRIDGE_* variable
// (e.g. billing routes); the ones above are picked up automatically.
<BridgeProvider config={{ billing: { paywallRoute: '/welcome' } }}>{children}</BridgeProvider>
```

</TabItem>
</Tabs>

The SDK reads `NEXT_PUBLIC_BRIDGE_APP_ID`, `NEXT_PUBLIC_BRIDGE_API_BASE_URL`, `NEXT_PUBLIC_BRIDGE_HOSTED_URL`, `NEXT_PUBLIC_BRIDGE_CALLBACK_URL`, `NEXT_PUBLIC_BRIDGE_DEFAULT_REDIRECT_ROUTE`, `NEXT_PUBLIC_BRIDGE_LOGIN_ROUTE`, `NEXT_PUBLIC_BRIDGE_SIGNUP_ROUTE`, and `NEXT_PUBLIC_BRIDGE_DEBUG`. The server-side helpers (`withBridgeAuth`, `getConfig()`) read the same variables with the same precedence, so keep the values identical between the client bundle and the server process (the same `.env` file, deployed consistently).

## Configs managed in Control Center

Some settings aren't passed in code at all. They're set once per app, and Bridge enforces them server-side:

| Setting | What it does |
|---------|---------------|
| Redirect URIs | The allowlist of callback URLs Bridge is allowed to redirect to. Any `callbackUrl` you pass to `<BridgeProvider>` must already be on this list. |
| Allowed origins | The CORS allowlist: origins permitted to call the Bridge API directly from the browser. It also decides where a magic link may be delivered: Bridge refuses to send one whose [return page](/auth/sign-in/magic-link/#where-the-link-comes-back) is on an origin that isn't listed. |
| Default callback URL | Used whenever your app doesn't pass a `callbackUrl` in code. See [Callback URL](#callback-url). |

- **CLI:**

  ```bash
  bridge app update \
    --redirect-uris "https://app.example.com/oauth-callback,https://admin.example.com/oauth-callback" \
    --allowed-origins "https://app.example.com,https://admin.example.com" \
    --default-callback-uri "https://app.example.com/oauth-callback"
  ```

- **Control Center:** the same settings, managed from your app's settings.
- **MCP (AI-assistant integration):** connect your AI assistant to `https://api.thebridge.dev/mcp` as a remote MCP server (sign in and approve access to your app in the browser when it asks). Its `add_redirect_uri` and `remove_redirect_uri` tools change redirect URIs one at a time, and `update_app` sets allowed origins (the list you pass replaces the whole list) and the default callback URL.
