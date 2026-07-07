---
title: Email & password
description: Bridge email & password login for Next.js.
sidebar:
  label: Next.js
---

# Email & password

A complete login form with email/password fields. Handles multi-step auth flows inline: forgot password, passkey login, MFA challenge, MFA setup, and tenant selection all appear automatically within the same component when the auth state requires them.

**Usage:**

```tsx
'use client';
import { LoginForm } from '@nebulr-group/bridge-nextjs/client';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  return (
    <LoginForm
      showSignupLink
      signupHref="/auth/signup"
      showForgotPassword
      showPasskeys
      onLogin={() => router.push('/dashboard')}
      onError={(err) => console.error(err)}
    />
  );
}
```

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `showSignupLink` | `boolean` | derived from app config | Show a link to the signup page |
| `signupHref` | `string` | `'/auth/signup'` | Signup page URL |
| `showForgotPassword` | `boolean` | `true` | Show the forgot password link |
| `forgotPasswordHref` | `string` | `'/auth/forgot-password'` | Forgot password page URL |
| `showMagicLink` | `boolean` | derived from app config | Show the magic link login option |
| `magicLinkHref` | `string` | `'/auth/magic-link'` | Magic link page URL |
| `showPasskeys` | `boolean` | derived from app config | Show the passkey login button |
| `passkeySetupHref` | `string` | `'/auth/setup-passkey'` | Where `PasskeyLogin` sends a user with no passkey registered yet |
| `onLogin` | `() => void` | — | Called after successful login (all steps complete) |
| `onError` | `(error: Error) => void` | — | Called on any login error |
| `onSsoClick` | `(connectionType: string) => void` | — | Called when an SSO button is clicked |
| `heading` | `string` | `''` | Custom heading text |
| `ssoConnections` | `FederationConnection[]` | `[]` | SSO connections to display. Auto-derived from app config if not set |
| `ssoMode` | `'redirect' \| 'popup'` | `'redirect'` | SSO kickoff strategy for the built-in buttons. See [SSO mode](/auth/ui/google-sso/#sso-mode-redirect-vs-popup). Ignored when `onSsoClick` is provided. |
| `footer` | `ReactNode` | — | Custom footer content |

**Auth state transitions:** After a successful email/password login, `LoginForm` checks the resulting auth state. If MFA is required, it automatically renders `MfaChallenge`. If MFA setup is required, it renders `MfaSetup`. If tenant selection is needed (multi-tenant user), it renders `TenantSelector`. The `onLogin` callback fires only after all steps are complete and the user is fully authenticated.
