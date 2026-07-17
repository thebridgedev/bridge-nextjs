# Passkeys

Passkey (WebAuthn) authentication lets users sign in with a biometric or device
credential instead of a password.

> **Framework note:** no extra peer dependency is required; the SDK talks to the browser's WebAuthn API directly.

## PasskeyLogin

A button that triggers passkey authentication via the browser's WebAuthn API.

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `onLogin` | `() => void` | (none) | Called after successful passkey login |
| `onError` | `(error: Error) => void` | (none) | Called on error |
| `onSetupPasskey` | `() => void` | (none) | Called when the user wants to set up a passkey instead |
| `setupHref` | `string` | (none) | Where to navigate when the user has no passkey yet and `onSetupPasskey` isn't provided |
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
| `onComplete` | `() => void` | (none) | Called after passkey registration |
| `onError` | `(error: Error) => void` | (none) | Called on error |
| `loginHref` | `string` | `'/auth/login'` | Link shown after registration completes |

```tsx
// app/auth/setup-passkey/[token]/page.tsx
'use client';
import { PasskeySetup } from '@nebulr-group/bridge-nextjs/client';
import { useRouter } from 'next/navigation';
import { use } from 'react';

export default function SetupPasskeyPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const router = useRouter();

  return (
    <PasskeySetup
      token={token}
      onComplete={() => router.push('/auth/login')}
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
| `onSent` | `() => void` | (none) | Called after the setup link email is sent |
| `onError` | `(error: Error) => void` | (none) | Called on error |
| `onBack` | `() => void` | (none) | Called when user clicks back. When omitted, a link to `loginHref` is rendered instead |
| `loginHref` | `string` | `'/auth/login'` | Link back to the login page (used when `onBack` isn't provided) |

```tsx
'use client';
import { PasskeyRequestSetupLink } from '@nebulr-group/bridge-nextjs/client';

export function RequestPasskeySetup() {
  return (
    <PasskeyRequestSetupLink
      initialEmail="user@example.com"
      onBack={() => console.log('Back to login')}
    />
  );
}
```
