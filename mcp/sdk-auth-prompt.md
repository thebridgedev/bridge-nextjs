# Bridge Next.js — SDK Auth Prompt

You are integrating in-app authentication UI (no redirect to bridge hosted auth) into a Next.js 15+ App Router project using **`@nebulr-group/bridge-nextjs`**. The plugin ships SDK auth components — login, signup, MFA, magic link, passkey, password reset, tenant/workspace selection — that render directly inside your app.

## Decide first — hosted or in-app?

| You want | Mode | What you build | Config |
|---|---|---|---|
| Bridge owns the login UI | **Hosted** (default) | Nothing — no login page | No `loginRoute` |
| Login inside your app, your styling | **SDK auth** | Your own routes rendering `<LoginForm />`, `<SignupForm />` … | `NEXT_PUBLIC_BRIDGE_LOGIN_ROUTE=/auth/login` |

**One config value is the whole switch.** Setting `NEXT_PUBLIC_BRIDGE_LOGIN_ROUTE` (or the `loginRoute` option on `withBridgeAuth`) turns hosted mode off. If you are being redirected to a route you never built, that is why.

> **Choosing SDK auth moves the route guard, and this is the easiest thing to get wrong in this package.** SDK-auth tokens live in the browser, where `withBridgeAuth` cannot see them, so the middleware steps aside for those requests (one dev-only warning) and **`<ProtectedRoute>` plus your own API become the guard**. A page protected only in `middleware.ts` is not protected in this mode.

If the user has not said which they want, ask. A wrong guess here means rewriting the auth pages.

The rest of this guide covers **SDK auth**.

## Then — which component? Reach for these, do not hand-roll

| Need | Component |
|---|---|
| Sign in | `<LoginForm />` |
| Sign up | `<SignupForm />` |
| Forgot password / set a new one | `<ForgotPassword />` (also inline in the login form; takes `token` for the set-password link) |
| Magic link | `<MagicLink />` |
| Passkey login / setup | `<PasskeyLogin />`, `<PasskeySetup />`, `<PasskeyRequestSetupLink />` |
| MFA challenge / setup | `<MfaChallenge />`, `<MfaSetup />` |
| Workspace ("tenant") selection | `<WorkspaceSelector />`, `<TenantSelector />` |
| SSO button | `<SsoButton />` |

> **`<LoginForm />` is not just an email and password box.** It drives forgot-password, magic link, passkeys, MFA and workspace selection as inline steps, and it decides which methods to show from the app's own configuration — which the client cannot see. Rebuilding any of it means reimplementing a flow that already exists, then keeping it in sync with settings you have no visibility of.

All of these import from `@nebulr-group/bridge-nextjs/client` and must live in a `'use client'` file.

## Prerequisites

- The integration prompt (`mcp/integration-prompt.md`) is complete: `BridgeProvider` wired, styles imported, OAuth callback route created.
- The Bridge app has **`tenantSelfSignup: true`** enabled.
- The Bridge app has the auth methods you intend to surface enabled (passwords, magic link, passkeys, SSO providers).

## Install

Already installed via the integration prompt.

## Migration check

If the project uses the legacy `@nblocks/nblocks-nextjs`, replace its `<Login />` / signup pages with the new SDK components below.

## Wire the auth pages — one file

Set `loginRoute: '/auth/login'` (or `NEXT_PUBLIC_BRIDGE_LOGIN_ROUTE=/auth/login`), then create ONE page:

```tsx
// app/auth/[...bridge]/page.tsx
import { BridgeAuthRoutes } from '@nebulr-group/bridge-nextjs/client';

export default function AuthPage() {
  return <BridgeAuthRoutes />;
}
```

It serves `/auth/login`, `/auth/signup`, `/auth/oauth-callback`, `/auth/set-password/[token]`, `/auth/forgot-password`, `/auth/magic-link`, `/auth/setup-passkey/[token]` and `/auth/workspaces`. Do not create those pages one by one. `/auth/set-password/[token]` in particular is where every signup-verification and password-reset email lands; an app without it sends every new signup to a 404.

`LoginForm` (rendered on `/auth/login`) automatically:
- Detects MFA-required and renders `<MfaChallenge />`.
- Detects MFA-setup-required and renders `<MfaSetup />`.
- Detects tenant-selection and renders `<TenantSelector />`.
- Reads anonymous app config to show/hide SSO buttons, magic-link, passkey options.
- Picks up `?bridge_magic_link_token=…` from the URL and authenticates with it.

After sign-in the user returns to the `?redirectUri=` deep link, else `/`.

### Only if the developer asks to customise

- Restyle: `--bridge-*` CSS variables.
- Frame and heading: `frame={(page, children) => …}` and `heading={(page) => …}` on `<BridgeAuthRoutes>` — functions, so the page file gets `'use client'`.
- Take over ONE page: create its own file; Next.js prefers it over the catch-all. Next.js 15 passes `params` as a Promise:

```tsx
// app/auth/set-password/[token]/page.tsx
'use client';
import { ForgotPassword } from '@nebulr-group/bridge-nextjs/client';
import { use } from 'react';

export default function SetPasswordPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  return <ForgotPassword token={token} loginHref="/auth/login" />;
}
```

## Configure the Bridge app

In the Bridge admin UI:
- Enable **`tenantSelfSignup`** so the signup form works.
- Enable individual auth methods (Password, Magic Link, Passkeys, Google/Microsoft/LinkedIn/GitHub/Facebook/Apple SSO).
- The plugin reads these toggles via `ensureAppConfig()` and only shows the methods you've enabled.

## Environment variables

`NEXT_PUBLIC_BRIDGE_SIGNUP_ROUTE` (default `/auth/signup`) — used by `LoginForm`'s signup link.

## Accessing auth state

```tsx
'use client';
import {
  useAuth,
  useAuthState,
  useIsOnboarded,
  useHasMultiTenantAccess,
} from '@nebulr-group/bridge-nextjs/client';

export function MyPage() {
  const { isAuthenticated, logout } = useAuth();
  const authState = useAuthState();
  const isOnboarded = useIsOnboarded();
  const multiTenant = useHasMultiTenantAccess();
  // ...
}
```

## Workspace switching (for multi-tenant users)

```tsx
'use client';
import { WorkspaceSelector } from '@nebulr-group/bridge-nextjs/client';

export default function WorkspacesPage() {
  return <WorkspaceSelector onSwitch={() => window.location.reload()} />;
}
```

## Integration checklist

- [ ] `loginRoute: '/auth/login'` set (config prop or `NEXT_PUBLIC_BRIDGE_LOGIN_ROUTE`).
- [ ] `app/auth/[...bridge]/page.tsx` renders `<BridgeAuthRoutes />`, and no per-page auth files exist unless the developer asked to take one over.
- [ ] `/auth/set-password/<any>` renders the set-password form (not a 404).
- [ ] Bridge app has `tenantSelfSignup: true` and the right auth methods enabled.

## Verify

1. `npm run dev` and navigate to `/auth/signup`.
2. Submit the form — should show "Check your email".
3. Click the link in email — should authenticate and redirect.
4. Try `/auth/forgot-password` — should send a reset link.
5. Try `/auth/login` with MFA enabled — `<MfaChallenge />` should appear automatically after entering credentials.

If a method doesn't appear, check that it's enabled on the Bridge app config.
