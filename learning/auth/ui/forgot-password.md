# Forgot / reset password

Dual-mode component:
1. **Request mode** (no `token` prop) — shows an email form to request a password reset link.
2. **Reset mode** (`token` prop set) — shows a new password form to complete the reset.

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `token` | `string` | — | Reset token from the URL. When set, shows the new password form |
| `onComplete` | `() => void` | — | Called after the email is sent (request mode) or password is reset (reset mode) |
| `onError` | `(error: Error) => void` | — | Called on error |
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

**Reset page (with token from the URL):**

```tsx
// app/auth/reset-password/[token]/page.tsx
'use client';
import { ForgotPassword } from '@nebulr-group/bridge-nextjs/client';
import { useRouter } from 'next/navigation';

export default function ResetPasswordPage({ params }: { params: { token: string } }) {
  const router = useRouter();
  return (
    <ForgotPassword
      token={params.token}
      loginHref="/auth/login"
      onComplete={() => router.push('/auth/login')}
    />
  );
}
```
