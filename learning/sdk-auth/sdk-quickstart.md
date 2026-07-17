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

> **Framework note:** The `withBridgeAuth` middleware always redirects unauthenticated users to the hosted login page; for in-app login pages, gate protected pages with `<ProtectedRoute>` instead. See [Route guards](/auth/securing/route-guards/) for both layers.

## 3. Provider component (`app/layout.tsx`)

Add the `BridgeProvider` component to your root layout. It reads the `NEXT_PUBLIC_BRIDGE_*` env vars automatically.

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

## 4. Create a login page

Drop the `LoginForm` component onto a page that matches your `loginRoute`.

```tsx
// app/auth/login/page.tsx
'use client';
import { LoginForm } from '@nebulr-group/bridge-nextjs/client';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  return (
    <div className="login-page">
      <LoginForm showSignupLink onLogin={() => router.push('/')} />
    </div>
  );
}

/* globals.css (optional): center the forms on the page.
   Not required for the components to work.
.login-page,
.signup-page {
  display: flex;
  justify-content: center;
  padding: 3rem 1rem;
}
*/
```

Use the `onLogin` callback to send the user on after a successful sign-in. Auth method visibility (magic link, passkeys, SSO) is derived from your app's configuration in the Control Center (your admin dashboard at app.thebridge.dev).

`LoginForm` handles multi-step flows inline: forgot password, magic link requests, passkey login, MFA challenge, MFA setup, and workspace selection (a workspace is called a *tenant* in the API) all render within the same component automatically when needed.

**Optional props:** `onLogin` (fires after successful auth, useful for analytics), `onError` (fires on auth failure).

## 5. Create a signup page

```tsx
// app/auth/signup/page.tsx
'use client';
import { SignupForm } from '@nebulr-group/bridge-nextjs/client';

export default function SignupPage() {
  return (
    <div className="signup-page">
      <SignupForm showLoginLink loginHref="/auth/login" />
    </div>
  );
}
```

After a successful signup the user receives a verification email. Once verified, they can sign in.

**Optional props:** `onSignup` (fires after successful signup), `onError` (fires on failure).

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
| `hostedUrl` | `https://auth.thebridge.dev` | Bridge hosted UI URL (dev override) |
| `debug` | `false` | Enable debug logging |

See the [Configuration reference](/auth/config/) for the full list (token storage, billing routes).

Rather than hardcoding environment-specific values, keep them in a `.env.local` file; the SDK reads them automatically (the `NEXT_PUBLIC_` prefix is required for values to reach the browser):

```env
NEXT_PUBLIC_BRIDGE_APP_ID=your-app-id-here
NEXT_PUBLIC_BRIDGE_LOGIN_ROUTE=/auth/login
NEXT_PUBLIC_BRIDGE_DEFAULT_REDIRECT_ROUTE=/dashboard
```

You can also pass the same fields as a `config` prop on `<BridgeProvider>`; env values win when both are set:

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
