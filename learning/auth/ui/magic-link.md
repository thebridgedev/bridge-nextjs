# Magic link

Standalone magic link request form. When a user clicks a magic link from their email, the token is in the URL and Bridge processes it automatically.

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `onSent` | `() => void` | (none) | Called after the magic link email is sent |
| `onError` | `(error: Error) => void` | (none) | Called on error |
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

When the user clicks the link in their email, they are brought to your app. The token URL parameter is auto-handled by Bridge.

> **Framework note:** the token arrives as a `bridge_magic_link_token` query parameter and is detected and processed by `LoginForm` on mount, so the link should land the user on the page that renders `<LoginForm />`. If you're building a fully custom login page without `LoginForm`, handle that token yourself via `getBridgeAuth()`.
