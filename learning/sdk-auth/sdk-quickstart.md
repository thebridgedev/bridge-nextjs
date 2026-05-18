# SDK Auth Quickstart

Render authentication UI directly inside your app — no redirect to bridge hosted auth.

## Prerequisites

- The hosted-quickstart integration steps 1–4 are complete.
- The Bridge app has **`tenantSelfSignup: true`** enabled.
- Enable the auth methods you want (Password, Magic Link, Passkeys, SSO providers).

## Pages

### `app/auth/login/page.tsx`

```tsx
'use client';
import { LoginForm } from '@nebulr-group/bridge-nextjs/client';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  return <LoginForm heading="Sign in" onLogin={() => router.push('/')} />;
}
```

`<LoginForm>` handles MFA, tenant selection, and the magic-link callback automatically. It reads the anonymous app config and only shows enabled auth methods.

### `app/auth/signup/page.tsx`

```tsx
'use client';
import { SignupForm } from '@nebulr-group/bridge-nextjs/client';
import { useRouter } from 'next/navigation';

export default function SignupPage() {
  const router = useRouter();
  return <SignupForm onSignup={() => router.push('/auth/login')} />;
}
```

### Magic link / forgot password / set password / passkey setup

| Path | Component |
|---|---|
| `app/auth/magic-link/page.tsx` | `<MagicLink />` |
| `app/auth/forgot-password/page.tsx` | `<ForgotPassword />` |
| `app/auth/set-password/[token]/page.tsx` | `<ForgotPassword token={params.token} />` |
| `app/auth/setup-passkey/[token]/page.tsx` | `<PasskeySetup token={params.token} />` |

## App config

The plugin reads `getAppConfig()` (anonymous, called on mount) to know:
- Which SSO providers are enabled.
- Whether passwords / magic links / passkeys are available.
- Whether signup is allowed.

Toggles in the Bridge admin UI propagate to the LoginForm automatically.

## Customizing

Override props on `<LoginForm>`:

```tsx
<LoginForm
  showSignupLink={false}
  showMagicLink={false}
  showPasskeys={true}
  ssoConnections={[{ id: 'google', type: 'google', name: 'Google' }]}
  forgotPasswordHref="/help/reset-password"
/>
```

## Custom heading or footer

```tsx
<LoginForm
  heading="Welcome back to MyApp"
  footer={<p>By signing in you agree to our <a href="/terms">terms</a>.</p>}
/>
```

## See also

- [Auth state and hooks](../auth/auth.md)
- [Team management](../team-management/team-management.md)
