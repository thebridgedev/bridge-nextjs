---
title: SSO login button
description: Standalone SSO login button for Next.js.
sidebar:
  label: Next.js
---

# SSO login button

A standalone SSO login button for a single federation connection. Use this when you want SSO buttons outside of `LoginForm`, or to build a custom login page.

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `connection` | `FederationConnection` | **(required)** | The SSO connection object |
| `label` | `string` | `'Continue with {name}'` | Button label text |
| `mode` | `'redirect' \| 'popup'` | `'redirect'` | SSO kickoff strategy. See [SSO mode](#sso-mode-redirect-vs-popup). |
| `onSuccess` | `() => void` | — | Called after successful SSO login (popup mode only) |
| `onError` | `(error: Error) => void` | — | Called on error |
| `icon` | `ReactNode` | — | Custom icon node |

**Usage:**

```tsx
'use client';
import { SsoButton, type FederationConnection } from '@nebulr-group/bridge-nextjs/client';

export function SsoButtons({ connections }: { connections: FederationConnection[] }) {
  return (
    <>
      {connections.map((connection) => (
        <SsoButton
          key={connection.id}
          connection={connection}
          onSuccess={() => console.log('SSO login complete')}
          onError={(err) => console.error(err)}
        />
      ))}
    </>
  );
}
```

## SSO mode: redirect vs popup

Both `LoginForm` and standalone `SsoButton` support two SSO kickoff strategies via the `ssoMode` / `mode` prop:

| Mode | What happens | When to use |
|------|--------------|-------------|
| `'redirect'` **(default)** | Clicking the button navigates the current tab to the Bridge federation endpoint. The user is sent to the provider (Google, Microsoft, etc.), signs in, and the OAuth callback chain returns them to your app via the normal route guard flow. No popup, no cross-window messaging. | Almost all apps. This is the safest, most compatible default — pop-up blockers, mobile browsers, embedded webviews, and strict CSPs all work out of the box. The route guard automatically completes the auth transition when the user lands back on a protected route. |
| `'popup'` | Clicking the button opens `window.open()` to the Bridge federation endpoint with `mode=popup`. The popup completes the provider flow and `postMessage`'s the result back to the opener, which resolves the promise the button awaits internally. The host page never unloads. | Embedded widgets, multi-tab dashboards, or flows that must preserve unsaved state on the host page. Pop-up blockers may interfere — handle `onError` for the "popup blocked" case. |

**Redirect mode example:**

`LoginForm`, using the default:

```tsx
<LoginForm />
// or explicitly
<LoginForm ssoMode="redirect" />
```

Standalone `SsoButton`:

```tsx
<SsoButton connection={connection} />
// or explicitly
<SsoButton connection={connection} mode="redirect" />
```

In redirect mode, `onSuccess` / `onLogin` do **not** fire on the original page — it's already navigating away. Instead, rely on your route guard + `useAuthState()` transitions to pick up the session once the user lands back in your app.

**Popup mode example:**

`LoginForm`:

```tsx
<LoginForm ssoMode="popup" />
```

Standalone `SsoButton`:

```tsx
<SsoButton
  connection={connection}
  mode="popup"
  onSuccess={() => console.log('popup auth complete')}
  onError={(err) => {
    if (err.message.includes('popup')) {
      // popup was blocked — prompt the user to allow popups
    }
  }}
/>
```

**Under the hood:** both modes hit the same backend endpoint `GET /auth/auth/federation/:appId?provider=<type>`. Popup mode additionally sends `mode=popup&targetOrigin=<origin>` query params, which the backend uses to route the final callback into a `postMessage` instead of a normal redirect.
