# Magic link

Standalone magic link request form. When a user clicks a magic link from their email, the token arrives as a `bridge_magic_link_token` URL query parameter; `LoginForm` detects and processes it automatically on mount. If you're building a fully custom login page without `LoginForm`, handle that token yourself via `getBridgeAuth()`.

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `onSent` | `() => void` | — | Called after the magic link email is sent |
| `onError` | `(error: Error) => void` | — | Called on error |
| `loginHref` | `string` | `'/auth/login'` | Link back to the login page |

**Usage:**

```tsx
// app/auth/magic-link/page.tsx
'use client';
import { MagicLink } from '@nebulr-group/bridge-nextjs/client';

export default function MagicLinkPage() {
  return (
    <MagicLink
      loginHref="/auth/login"
      onSent={() => console.log('Check your email!')}
      onError={(err) => console.error(err)}
    />
  );
}
```

When the user clicks the link in their email, they land back on whatever page holds `<LoginForm />` (or your own page, if you handle the token manually) with the token as a query parameter.
