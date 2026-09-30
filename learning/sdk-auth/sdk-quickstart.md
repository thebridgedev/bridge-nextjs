# SDK auth quickstart

> This guide covers in-app SDK auth components. For the simplest setup using Bridge's hosted login page, see the [Hosted auth quickstart](../quickstart/hosted-quickstart.md).

Get up and running with The Bridge Next.js plugin using in-app SDK auth components, with no redirects to external login pages.

## 1. Install the plugin

```bash
npm i @nebulr-group/bridge-nextjs
```

## 2. Configuration (`.env.local`)

The `BridgeConfig` tells Bridge your `appId` and where your login page lives. Set both in `.env.local`:

```env
NEXT_PUBLIC_BRIDGE_APP_ID=your-app-id-here
NEXT_PUBLIC_BRIDGE_LOGIN_ROUTE=/auth/login
```

Key points:
- **`loginRoute`**: tells Bridge where to redirect unauthenticated users (your in-app login page).
- Protect pages client-side by wrapping them in `<ProtectedRoute redirectTo="/auth/login">`.

> **Framework note:** in-app sign-in keeps its tokens in the browser, where the `withBridgeAuth` middleware cannot see them; gate protected pages with `<ProtectedRoute>`. See [Route guards](/auth/securing/route-guards/) for both layers.

## 3. Provider component (`app/layout.tsx`)

Add the `BridgeProvider` component to your root layout. It reads the `NEXT_PUBLIC_BRIDGE_*` env vars automatically, and the layout stays a Server Component: the config is plain data.

```tsx
// app/layout.tsx
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

## 4. One file serves every sign-in page

```tsx
// app/auth/[...bridge]/page.tsx
import { BridgeAuthRoutes } from '@nebulr-group/bridge-nextjs/client';

export default function AuthPage() {
  return <BridgeAuthRoutes />;
}
```

That file serves `/auth/login`, `/auth/signup`, `/auth/oauth-callback`, `/auth/set-password/[token]`, `/auth/forgot-password`, `/auth/magic-link`, `/auth/setup-passkey/[token]` and `/auth/workspaces`. Any other address under `/auth` gets your app's own not-found page.

> **Do not skip set-password.** `/auth/set-password/[token]` is where Bridge's signup-verification and password-reset emails land. An app that hand-writes its sign-in pages and leaves this one out sends every new signup to a 404. The catch-all serves it; if you take pages over one by one, keep it.

Auth method visibility (magic link, passkeys, SSO) is derived from your app's configuration in the Control Center (your admin dashboard at app.thebridge.dev), so turning magic links on needs no code. `LoginForm` handles multi-step flows inline: forgot password, magic link requests, passkey login, MFA challenge, MFA setup, and workspace selection (a workspace is called a *tenant* in the API). After sign-in the user goes back to the page they were heading for (the `?redirectUri=` deep link), else to `/`.

## 5. Customising the pages

Climb only as far as you need:

| Rung | What you do | What you own |
|---|---|---|
| **0 — nothing** | The pages render inside your own `app/layout.tsx` | Your navigation, header and shell already surround them |
| **1 — tokens** | Set `--bridge-*` CSS variables in your CSS | Colours, radius, spacing |
| **2 — frame and heading** | Pass `frame(page, children)` and `heading(page)` render-props | Everything around the form on every page, and each page's heading |
| **3 — take over one page** | Create that page's own file, e.g. `app/auth/login/page.tsx` | That one page; Next.js prefers it over `[...bridge]`, every other page keeps working |
| **4 — headless** | Build your own UI on `getBridgeAuth()` | Everything |

Rung 2 passes functions, so that page file is a Client Component:

```tsx
// app/auth/[...bridge]/page.tsx
'use client';
import { BridgeAuthRoutes } from '@nebulr-group/bridge-nextjs/client';

export default function AuthPage() {
  return (
    <BridgeAuthRoutes
      frame={(page, children) => <main className="auth-card">{children}</main>}
      heading={(page) => <h1>{page === 'signup' ? 'Create your account' : 'Welcome back'}</h1>}
    />
  );
}
```

`heading` replaces only each page's main step (the login credentials step, the signup form, the set-password form); sub-steps such as "Reset your password" keep their own, so two headings never stack.

Rung 3: a page you own navigates itself after sign-in. Next.js 15 passes route params as a Promise:

```tsx
// app/auth/set-password/[token]/page.tsx — takes over one page
'use client';
import { ForgotPassword } from '@nebulr-group/bridge-nextjs/client';
import { useRouter } from 'next/navigation';
import { use } from 'react';

export default function SetPasswordPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const router = useRouter();
  return <ForgotPassword token={token} loginHref="/auth/login" onComplete={() => router.push('/auth/login')} />;
}
```

## 6. Styles

See [Theming & Styles](../theming/theming.md) for customization options.

## 7. Configuration

The config `<BridgeProvider>` uses is a `BridgeConfig`. The most common fields:

| Field | Default | Description |
|-------|---------|-------------|
| `appId` | **(required)** | Your Bridge app ID |
| `loginRoute` | (unset) | In-app route of your login page; unauthenticated users are redirected here |
| `signupRoute` | (unset) | In-app route of your signup page |
| `defaultRedirectRoute` | `'/'` | Route to land on after login |
| `apiBaseUrl` | `https://api.thebridge.dev` | Root URL for the Bridge API (dev override) |
| `hostedUrl` | follows `apiBaseUrl` on Bridge's domains | Bridge hosted UI URL; set only for a local or self-hosted Bridge |
| `debug` | `false` | Enable debug logging |

See the [Configuration reference](/auth/config/) for the full list (token storage, billing routes).

Rather than hardcoding environment-specific values, keep them in a `.env.local` file; the SDK reads them automatically (the `NEXT_PUBLIC_` prefix is required for values to reach the browser):

```env
NEXT_PUBLIC_BRIDGE_APP_ID=your-app-id-here
NEXT_PUBLIC_BRIDGE_LOGIN_ROUTE=/auth/login
NEXT_PUBLIC_BRIDGE_DEFAULT_REDIRECT_ROUTE=/dashboard
```

You can also pass the same fields as a `config` prop on `<BridgeProvider>`; a value passed there wins over the env var:

```tsx
<BridgeProvider config={{ loginRoute: '/auth/login', defaultRedirectRoute: '/dashboard' }}>
  {children}
</BridgeProvider>
```

## Next steps

- **More auth UI components**: [MFA](/auth/ui/mfa/), [passkeys](/auth/ui/passkeys/), [magic link](/auth/ui/magic-link/), [SSO login button](/auth/ui/google-sso/), [switching workspaces](/auth/ui/switching-workspaces/), and [user & team management](/auth/ui/team-management/).
- **The user token**: [logging in and logging out](/auth/user-token/logging-in-and-out/), [getting the token](/auth/user-token/getting-the-token/), and [auth states](/auth/user-token/auth-states/).
- **Route protection**: [frontend route guards](/auth/securing/route-guards/), or browse the full [Auth](/auth/) section.
- **Feature flags and billing**: [how flags work](/feature-flags/how-it-works/) and [how billing works](/billing/how-it-works/).
