# Bridge Next.js — SDK Auth Prompt

You are integrating in-app authentication UI (no redirect to bridge hosted auth) into a Next.js 15+ App Router project using **`@nebulr-group/bridge-nextjs`**. The plugin ships SDK auth components — login, signup, MFA, magic link, passkey, password reset, tenant/workspace selection — that render directly inside your app.

## Prerequisites

- The integration prompt (`mcp/integration-prompt.md`) is complete: `BridgeProvider` wired, styles imported, OAuth callback route created.
- The Bridge app has **`tenantSelfSignup: true`** enabled.
- The Bridge app has the auth methods you intend to surface enabled (passwords, magic link, passkeys, SSO providers).

## Install

Already installed via the integration prompt.

## Migration check

If the project uses the legacy `@nblocks/nblocks-nextjs`, replace its `<Login />` / signup pages with the new SDK components below.

## Wire the auth pages

### Login page — `app/auth/login/page.tsx`

```tsx
'use client';
import { LoginForm } from '@nebulr-group/bridge-nextjs/client';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  return (
    <LoginForm
      heading="Sign in"
      onLogin={() => router.push('/')}
      onError={(err) => console.error(err)}
    />
  );
}
```

`LoginForm` automatically:
- Detects MFA-required and renders `<MfaChallenge />`.
- Detects MFA-setup-required and renders `<MfaSetup />`.
- Detects tenant-selection and renders `<TenantSelector />`.
- Reads anonymous app config to show/hide SSO buttons, magic-link, passkey options.
- Picks up `?bridge_magic_link_token=…` from the URL and authenticates with it.

### Signup page — `app/auth/signup/page.tsx`

```tsx
'use client';
import { SignupForm } from '@nebulr-group/bridge-nextjs/client';
import { useRouter } from 'next/navigation';

export default function SignupPage() {
  const router = useRouter();
  return <SignupForm onSignup={() => router.push('/auth/login')} />;
}
```

### Magic link page — `app/auth/magic-link/page.tsx`

```tsx
'use client';
import { MagicLink } from '@nebulr-group/bridge-nextjs/client';

export default function MagicLinkPage() {
  return <MagicLink />;
}
```

### Forgot password — `app/auth/forgot-password/page.tsx`

```tsx
'use client';
import { ForgotPassword } from '@nebulr-group/bridge-nextjs/client';

export default function ForgotPasswordPage() {
  return <ForgotPassword />;
}
```

### Set new password — `app/auth/set-password/[token]/page.tsx`

```tsx
'use client';
import { ForgotPassword } from '@nebulr-group/bridge-nextjs/client';

export default function SetPasswordPage({ params }: { params: { token: string } }) {
  return <ForgotPassword token={params.token} />;
}
```

### Passkey setup landing — `app/auth/setup-passkey/[token]/page.tsx`

```tsx
'use client';
import { PasskeySetup } from '@nebulr-group/bridge-nextjs/client';

export default function SetupPasskeyPage({ params }: { params: { token: string } }) {
  return <PasskeySetup token={params.token} />;
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

- [ ] `app/auth/login/page.tsx` mounts `<LoginForm />`.
- [ ] `app/auth/signup/page.tsx` mounts `<SignupForm />`.
- [ ] `app/auth/magic-link/page.tsx` mounts `<MagicLink />`.
- [ ] `app/auth/forgot-password/page.tsx` mounts `<ForgotPassword />`.
- [ ] `app/auth/set-password/[token]/page.tsx` mounts `<ForgotPassword token={params.token} />`.
- [ ] `app/auth/setup-passkey/[token]/page.tsx` mounts `<PasskeySetup token={params.token} />`.
- [ ] Bridge app has `tenantSelfSignup: true` and the right auth methods enabled.

## Verify

1. `npm run dev` and navigate to `/auth/signup`.
2. Submit the form — should show "Check your email".
3. Click the link in email — should authenticate and redirect.
4. Try `/auth/forgot-password` — should send a reset link.
5. Try `/auth/login` with MFA enabled — `<MfaChallenge />` should appear automatically after entering credentials.

If a method doesn't appear, check that it's enabled on the Bridge app config.
