# bridge Nextjs plugin

This repository contains both the bridge Next.js library and a demo application showcasing its features. To get started have a look at the following link on the [github repo](https://github.com/nebulr-group/bridge-nextjs/blob/main/README.md)


## What is bridge?

bridge is a powerful service that  provides essential features such as authentication, feature flags, and team management, making it easier for developers to build robust and scalable applications. With bridge, you can streamline your development process and focus on delivering value to your users.

## The whole integration

One line of `.env` and three files. Every other page Bridge needs, it serves.

```env
# .env.local
NEXT_PUBLIC_BRIDGE_APP_ID=your-app-id
# only for a stage/local app — the hosted sign-in pages follow it:
# NEXT_PUBLIC_BRIDGE_API_BASE_URL=https://api-stage.thebridge.dev
```

```tsx
// app/layout.tsx — stays a Server Component; the config is plain data
import { BridgeProvider } from '@nebulr-group/bridge-nextjs/client';
import '@nebulr-group/bridge-nextjs/styles';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <BridgeProvider config={{ loginRoute: '/auth/login' }}>{children}</BridgeProvider>
      </body>
    </html>
  );
}
```

```tsx
// app/auth/[...bridge]/page.tsx — login, signup, oauth-callback, set-password/[token],
// forgot-password, magic-link, setup-passkey/[token], workspaces
import { BridgeAuthRoutes } from '@nebulr-group/bridge-nextjs/client';
export default function AuthPage() {
  return <BridgeAuthRoutes />;
}
```

```tsx
// app/subscription/[[...bridge]]/page.tsx — /subscription, /plan (the paywall), /success, /error
import { BridgeBillingRoutes } from '@nebulr-group/bridge-nextjs/client';
export default function SubscriptionPage() {
  return <BridgeBillingRoutes />;
}
```

Settings resolve as *explicit option > `NEXT_PUBLIC_BRIDGE_*` environment > default*. Plan limits need no page code: a backend `402 QUOTA_EXCEEDED` opens the upgrade dialog; `<QuotaGate>` and `useQuota()` are there when you want more. See [How Bridge works](https://github.com/thebridgedev/bridge-nextjs/blob/main/learning/mechanisms.md).

## Route protection

- **Hosted login** (no `loginRoute`): the session is a cookie, and the `withBridgeAuth` middleware is the route guard. It enforces unmatched routes under `defaultAccess: 'protected'` and any rule without `public: true`. It verifies the session token: its PS256 signature against the Bridge JWKS (`<apiBaseUrl>/auth/.well-known/jwks.json`), issuer `<apiBaseUrl>/auth`, audience containing your `appId`, and expiry; a failed check denies.
- **SDK auth** (`<LoginForm />`, `loginRoute` set): tokens live in the browser, where middleware cannot see them. `withBridgeAuth` steps aside for those requests (it is not authoritative there), and `<ProtectedRoute>` plus your API are the guards.
- **Neither route guard is authorization.** Every API route must verify the user's token itself.

See [Route guards](https://thebridge.dev/docs/auth/securing/route-guards/#which-layer-guards-what). To require sign-in and a feature flag on one route, put `featureFlag` on the `withBridgeAuth` rule: `{ match: '/beta', featureFlag: 'beta-access' }`.
