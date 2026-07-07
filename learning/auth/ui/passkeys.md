# Passkeys

Passkey (WebAuthn) authentication lets users sign in with a biometric or device
credential instead of a password. Uses the browser's native `navigator.credentials` WebAuthn API — no extra peer dependency required in `bridge-nextjs` (unlike `bridge-svelte`, which depends on `@simplewebauthn/browser`).

## PasskeyLogin

A button that triggers passkey authentication via the browser's WebAuthn API.

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `onLogin` | `() => void` | — | Called after successful passkey login |
| `onError` | `(error: Error) => void` | — | Called on error |
| `onSetupPasskey` | `() => void` | — | Called when the user has no passkey registered yet, instead of the default redirect |
| `setupHref` | `string` | — | Where to redirect (via `window.location.href`) when there's no passkey and `onSetupPasskey` isn't provided |
| `label` | `string` | `'Continue with passkey'` | Button label text |

```tsx
'use client';
import { PasskeyLogin } from '@nebulr-group/bridge-nextjs/client';
import { useRouter } from 'next/navigation';

export function PasskeyLoginButton() {
  const router = useRouter();
  return (
    <PasskeyLogin
      onLogin={() => router.push('/dashboard')}
      onError={(err) => console.error(err)}
      setupHref="/auth/setup-passkey"
    />
  );
}
```

## PasskeySetup

Registers a new passkey using a setup token (emailed to the user).

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `token` | `string` | **(required)** | The setup token from the URL |
| `onComplete` | `() => void` | — | Called after passkey registration |
| `onError` | `(error: Error) => void` | — | Called on error |
| `loginHref` | `string` | `'/auth/login'` | Link shown after registration completes |

```tsx
// app/auth/setup-passkey/[token]/page.tsx
'use client';
import { PasskeySetup } from '@nebulr-group/bridge-nextjs/client';

export default function SetupPasskeyPage({ params }: { params: { token: string } }) {
  return (
    <PasskeySetup
      token={params.token}
      loginHref="/auth/login"
      onComplete={() => console.log('Passkey registered')}
    />
  );
}
```

## PasskeyRequestSetupLink

An email form that requests a passkey setup link be sent to the user.

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `initialEmail` | `string` | `''` | Pre-filled email address |
| `onSent` | `() => void` | — | Called after the setup link email is sent |
| `onError` | `(error: Error) => void` | — | Called on error |
| `onBack` | `() => void` | — | Called when the user clicks back. When omitted, a link to `loginHref` is rendered instead |
| `loginHref` | `string` | `'/auth/login'` | Link back to the login page (used when `onBack` isn't provided) |

```tsx
'use client';
import { PasskeyRequestSetupLink } from '@nebulr-group/bridge-nextjs/client';

export function RequestPasskeySetup() {
  return (
    <PasskeyRequestSetupLink
      initialEmail="user@example.com"
      onSent={() => console.log('Setup link sent')}
    />
  );
}
```
