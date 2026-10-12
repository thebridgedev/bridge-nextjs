# Bridge Next.js — SDK Auth Prompt

You are integrating in-app authentication UI (no redirect to bridge hosted auth) into a Next.js 15+ App Router project using **`@nebulr-group/bridge-nextjs`**. The plugin ships SDK auth components — login, signup, MFA, magic link, passkey, password reset, tenant/workspace selection — that render directly inside your app.

## Decide first — hosted or in-app?

| You want | Mode | What you build | Config |
|---|---|---|---|
| Login inside your app, matching its design | **SDK auth** (default) — this guide | One catch-all `app/auth/[...bridge]/page.tsx` rendering `<BridgeAuthRoutes />` | `NEXT_PUBLIC_BRIDGE_LOGIN_ROUTE=/auth/login` |
| Bridge owns the login UI | **Hosted** — only when the developer explicitly asks for it | Nothing — no login page | No `loginRoute` |

**One config value is the whole switch.** Setting `NEXT_PUBLIC_BRIDGE_LOGIN_ROUTE` (or the `loginRoute` option on `withBridgeAuth`) turns hosted mode off. If you are being redirected to a route you never built, that is why.

> **Choosing SDK auth moves the route guard, and this is the easiest thing to get wrong in this package.** SDK-auth tokens live in the browser, where `withBridgeAuth` cannot see them, so the middleware steps aside for those requests (one dev-only warning) and **`<ProtectedRoute>` plus your own API become the guard**. A page protected only in `middleware.ts` is not protected in this mode.

Do not ask the developer to choose: this guide is the approach unless they asked for hosted. Tell them in one line that sign-in will be in-app, styled to match their app.

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

## Match the app's design — always

The sign-in pages render inside the app, so they must look like the rest of it. Bridge's built-in look (indigo buttons, grey borders) is a fallback for an app with no design, never the finished result. Do this without asking:

1. **Read the app's design.** The global stylesheet (`app/globals.css`, imported by `app/layout.tsx`) and its CSS variables, `tailwind.config.*` or the Tailwind `@theme` block, a component library's theme (shadcn/ui, MUI, Chakra, Mantine, …), the font the app loads, and one existing primary button and text input.
2. **Set the `--bridge-*` tokens from it** in that global stylesheet, pointing at the app's own variables rather than copying values, so dark mode and later theme changes carry over:

   ```css
   :root {
     --bridge-primary: var(--color-primary);          /* the app's primary button background */
     --bridge-primary-hover: var(--color-primary-hover);
     --bridge-primary-fg: var(--color-primary-foreground);
     --bridge-border: var(--color-border);
     --bridge-input-focus: var(--color-ring);
     --bridge-border-radius: var(--radius);
     --bridge-foreground: var(--color-foreground);
     --bridge-muted: var(--color-muted-foreground);
     --bridge-bg: var(--color-background);
     --bridge-muted-bg: var(--color-muted);
   }
   ```

   The names on the right are examples: use the variables the app actually defines, or its literal values when it has none. Map its error and success colours to the `--bridge-alert-*` tokens. The components inherit the page font; set nothing for it unless the app puts its font on something other than `body`. The full token list: `bridge guide mechanisms`.
3. **Give the pages the app's frame** when the app's own pages sit in a card, a panel or a split layout: pass `frame={(page, children) => …}` to `<BridgeAuthRoutes>` (the page file then needs `'use client'`), built from the app's own classes or components, so sign-in is not the one page that looks different.

Ask the developer for colours only when the project has no styles of its own.

### Customising further — only if the developer asks

- Restyle: `--bridge-*` CSS variables, as above.
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
- [ ] `app/globals.css` sets the `--bridge-*` tokens from the app's own design; `frame` used when the app frames its pages.

## Verify

1. `npm run dev` and open `/auth/login`. Next to one of the app's own pages, `/auth/login` matches it: buttons, inputs, font, corners and frame — in dark mode too if the app has one. No Bridge indigo is left.
2. Navigate to `/auth/signup`.
3. Submit the form — should show "Check your email".
4. Click the link in email — should authenticate and redirect.
5. Try `/auth/forgot-password` — should send a reset link.
6. Try `/auth/login` with MFA enabled — `<MfaChallenge />` should appear automatically after entering credentials.

If a method doesn't appear, check that it's enabled on the Bridge app config.
