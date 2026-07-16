# Forgot / reset password

Dual-mode component:
1. **Request mode** (no `token` prop): shows an email form to request a password reset link.
2. **Reset mode** (`token` prop set): shows a new password form to complete the reset.

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `token` | `string` | (none) | Reset token from URL. When set, shows the new password form |
| `onComplete` | `() => void` | (none) | Called after the email is sent (request mode) or password is reset (reset mode) |
| `onError` | `(error: Error) => void` | (none) | Called on error |
| `loginHref` | `string` | `'/auth/login'` | Link back to the login page |

**Request page:**

```tsx
// app/auth/forgot-password/page.tsx
'use client';
import { ForgotPassword } from '@nebulr-group/bridge-nextjs/client';

export default function ForgotPasswordPage() {
  return (
    <ForgotPassword
      loginHref="/auth/login"
      onComplete={() => console.log('Reset email sent')}
    />
  );
}
```

**Reset page (with token from URL):**

```tsx
// app/auth/reset-password/page.tsx
'use client';
import { ForgotPassword } from '@nebulr-group/bridge-nextjs/client';
import { useRouter, useSearchParams } from 'next/navigation';

export default function ResetPasswordPage() {
  const router = useRouter();
  const token = useSearchParams().get('token') ?? '';

  return (
    <ForgotPassword
      token={token}
      loginHref="/auth/login"
      onComplete={() => router.push('/auth/login')}
    />
  );
}
```
