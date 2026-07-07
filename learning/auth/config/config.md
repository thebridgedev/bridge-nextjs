---
title: Configurations
description: The BridgeConfig options you pass to BridgeProvider and middleware, and the app settings managed in Control Center.
sidebar:
  label: Next.js
---

# Configurations

bridge-nextjs splits configuration across two runtimes that each read it independently: the **client** (via `<BridgeProvider>`, mounted once near the root of your app) and the **server** (via `withBridgeAuth` in `middleware.ts`, and `getConfig()` for any other server-side code). Both fall back to the same `NEXT_PUBLIC_BRIDGE_*` environment variables, so as long as your `.env` is set, most apps never pass explicit config to either side.

## Passing config to the client

Wrap your app in `<BridgeProvider>`, passing an `appId` or a full `BridgeConfig` object:

```tsx
// app/layout.tsx
import { BridgeProvider } from '@nebulr-group/bridge-nextjs/client';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <BridgeProvider
          config={{
            appId: process.env.NEXT_PUBLIC_BRIDGE_APP_ID,
            loginRoute: '/auth/login',
          }}
        >
          {children}
        </BridgeProvider>
      </body>
    </html>
  );
}
```

`<BridgeProvider>` is idempotent — it guards its own init with a ref, so re-renders don't re-run bootstrap. Config resolution priority (highest to lowest) is: **environment variables** → **the `config` prop** → built-in defaults. This means an env var always wins over a value hardcoded in the `config` prop, so ops can override behavior per-environment without a code change.

## Passing config to the server

`middleware.ts` and any server-only helper (`getConfig()`, `initServices()`, `<ServerFeatureFlag>`) read the same env vars independently — there's no single call that configures both runtimes at once the way `bridgeBootstrap()` does in bridge-svelte:

```ts
// middleware.ts
import { withBridgeAuth } from '@nebulr-group/bridge-nextjs/server';

export default withBridgeAuth({
  rules: [{ match: '/', public: true }],
  defaultAccess: 'protected',
  // appId / authBaseUrl / callbackUrl / debug: optional overrides — normally
  // left unset so NEXT_PUBLIC_BRIDGE_* env vars are used instead.
});
```

Keep the `NEXT_PUBLIC_BRIDGE_*` values identical between what the client sees and what the server process sees (the same `.env` file, deployed consistently) — since the two are resolved independently, a mismatch (for example, a different `appId` in each) silently produces two different sessions instead of an error.

## Reading the resolved config

There's no runtime "resolved config" store to read back on the client (unlike bridge-svelte's `readonlyConfig`) — the config `<BridgeProvider>` resolved is not re-exposed as a hook. If your own components need one of these values at runtime, read the same `NEXT_PUBLIC_BRIDGE_*` env var directly, or lift the object you pass to `config` into a shared module so both `<BridgeProvider>` and your own code import the same values. On the server, `getConfig()` (from `@nebulr-group/bridge-nextjs/server`) does return the fully-resolved `BridgeConfig` object if you need it in a Route Handler or Server Component:

```ts
import { getConfig } from '@nebulr-group/bridge-nextjs/server';

const config = getConfig();
console.log(config.appId, config.loginRoute);
```

## Callback URL

`callbackUrl` is the URL Bridge calls back to once a login completes. If you omit it, `<BridgeProvider>` defaults to `${window.location.origin}/auth/oauth-callback`, and that path must resolve to a Route Handler built with `createBridgeCallbackRoute` — see [Route guards](/auth/securing/route-guards/).

Passing a specific `callbackUrl` lets you send different parts of your app through different post-login destinations — for example, an admin section and a regular user section of the same app, or entirely separate apps sharing one Bridge project.

Whatever you pass here must already be registered as an allowed redirect URI in Control Center — see [Configs managed in Control Center](#configs-managed-in-control-center) — Bridge only redirects to callback URLs it's been told about.

```tsx
<BridgeProvider
  config={{
    appId: process.env.NEXT_PUBLIC_BRIDGE_APP_ID,
    callbackUrl: `${typeof window !== 'undefined' ? window.location.origin : ''}/admin/oauth-callback`,
  }}
>
  {children}
</BridgeProvider>
```

## All config options

| Option | Type | Default | Description |
|--------|------|---------|--------------|
| `appId` | `string` | — (required) | Your Bridge application ID |
| `apiBaseUrl` | `string` | `https://api.thebridge.dev` | Root API URL — `authBaseUrl` / `cloudViewsUrl` are derived from it |
| `callbackUrl` | `string` | `${origin}/auth/oauth-callback` | Where the login flow redirects back to after a successful login — see [Callback URL](#callback-url) |
| `defaultRedirectRoute` | `string` | `'/'` | Route to redirect to after login |
| `loginRoute` | `string` | `'/login'` | Route to redirect to when authentication fails |
| `signupRoute` | `string` | `'/auth/signup'` | Route where your signup page lives; `LoginForm` links to it when set |
| `billing.paywallRoute` | `string` | — | Route to redirect to when the tenant has no plan selected |
| `billing.paymentErrorRoute` | `string` | `'/payment-error'` | Route to redirect to when a Stripe checkout confirmation fails |
| `debug` | `boolean` | `false` | Enable debug logging |

A few legacy fields (`authBaseUrl`, `cloudViewsUrl`, `teamManagementUrl`) are still accepted for backward compatibility but are deprecated — set `apiBaseUrl` instead and let bridge-nextjs derive the rest.

## Passing values via .env

> **Tip:** this is just a best practice, not a requirement. Keep environment-specific values in `.env.local` instead of hardcoding them. The `NEXT_PUBLIC_` prefix is required for a value to reach the browser bundle; without it, only server-side code (`getConfig()`, middleware) can read it.

```env
# .env.local
NEXT_PUBLIC_BRIDGE_APP_ID=your-app-id-here
NEXT_PUBLIC_BRIDGE_API_BASE_URL=https://api.thebridge.dev
NEXT_PUBLIC_BRIDGE_LOGIN_ROUTE=/auth/login
NEXT_PUBLIC_BRIDGE_DEFAULT_REDIRECT_ROUTE=/dashboard
NEXT_PUBLIC_BRIDGE_DEBUG=true
```

```tsx
// app/layout.tsx — reading them explicitly is optional; <BridgeProvider>
// already reads NEXT_PUBLIC_BRIDGE_* itself, so passing appId is enough here.
<BridgeProvider appId={process.env.NEXT_PUBLIC_BRIDGE_APP_ID}>{children}</BridgeProvider>
```

## Configs managed in Control Center

Some settings aren't passed in code at all — they're set once per app, and Bridge enforces them server-side:

| Setting | What it does |
|---------|---------------|
| Redirect URIs | The allowlist of callback URLs Bridge is allowed to redirect to. Any `callbackUrl` you pass to `<BridgeProvider>` must already be on this list. |
| Allowed origins | The CORS allowlist — origins permitted to call the Bridge API directly from the browser. |
| Default callback URL | Used whenever your app doesn't pass a `callbackUrl` in code — see [Callback URL](#callback-url). |

- **CLI:**

  ```bash
  bridge app update \
    --redirect-uris "https://app.example.com/oauth-callback,https://admin.example.com/oauth-callback" \
    --allowed-origins "https://app.example.com,https://admin.example.com" \
    --default-callback-uri "https://app.example.com/oauth-callback"
  ```

- **Control Center:** the same settings, managed from your app's settings.
- **MCP:** not yet available — coming soon.
