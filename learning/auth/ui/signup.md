# Signup

A signup form with email, first name, and last name fields.

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `onSignup` | `() => void` | — | Called after successful signup |
| `onError` | `(error: Error) => void` | — | Called on signup error |
| `showLoginLink` | `boolean` | `true` | Show a link to the login page |
| `loginHref` | `string` | `'/auth/login'` | Login page URL |
| `heading` | `string` | `'Create your account'` | Custom heading text |
| `footer` | `ReactNode` | — | Custom footer content |

**Usage:**

```tsx
'use client';
import { SignupForm } from '@nebulr-group/bridge-nextjs/client';
import { useRouter } from 'next/navigation';

export default function SignupPage() {
  const router = useRouter();
  return (
    <SignupForm
      showLoginLink
      loginHref="/auth/login"
      onSignup={() => router.push('/auth/login')}
      onError={(err) => console.error(err)}
    />
  );
}
```

After signup, the user receives a verification email. Once verified, they can log in.
