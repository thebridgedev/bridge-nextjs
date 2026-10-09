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

**Set-password page (with the token from the email link):**

> `<BridgeAuthRoutes>` already serves this page at `/auth/set-password/[token]` (see the [in-app quickstart](../../sdk-auth/sdk-quickstart.md)). The example below is for taking the page over; a file at that address wins over the catch-all.

**Do not leave this page out.** Signup-verification and password-reset emails both link to `/auth/set-password/[token]`. An app without it sends every new signup to a 404.

Next.js 15 passes route params as a Promise; unwrap it with `use()`:

```tsx
// app/auth/set-password/[token]/page.tsx
'use client';
import { ForgotPassword } from '@nebulr-group/bridge-nextjs/client';
import { useRouter } from 'next/navigation';
import { use } from 'react';

export default function SetPasswordPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const router = useRouter();

  return (
    <ForgotPassword
      token={token}
      loginHref="/auth/login"
      onComplete={() => router.push('/auth/login')}
    />
  );
}
```
