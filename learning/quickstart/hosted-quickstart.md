# Hosted auth quickstart

The fastest way to add authentication to your Next.js app. Bridge handles the entire login UI on a hosted page, so you don't need to build any auth forms.

## 1. Install the plugin

```bash
npm i @nebulr-group/bridge-nextjs
```

## 2. Configuration (`middleware.ts`)

Initialize route protection in your middleware. For hosted auth, you only need `appId` (read from env) and route rules. No `loginRoute` is needed because Bridge redirects unauthenticated users to the hosted login page automatically.

```ts
// middleware.ts
import { withBridgeAuth } from '@nebulr-group/bridge-nextjs/server';

export default withBridgeAuth({
  rules: [
    { match: '/', public: true },
    { match: /^\/auth($|\/)/, public: true },
  ],
  defaultAccess: 'protected',
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
```

Key points:
- **No `loginRoute`**: without it, Bridge redirects to the hosted login page instead of an in-app route.
- **`defaultAccess: 'protected'`**: all routes require auth unless explicitly marked `public`.
- **`config.matcher`**: standard Next.js middleware config; excluding `_next/static`, `_next/image`, and `favicon.ico` avoids running the auth check against build assets.

## 3. Provider component (`app/layout.tsx`)

Add the `BridgeProvider` component to your root layout. It reads its configuration from the `NEXT_PUBLIC_BRIDGE_*` env vars (step 6).

```tsx
// app/layout.tsx
import { BridgeProvider } from '@nebulr-group/bridge-nextjs/client';
import '@nebulr-group/bridge-nextjs/styles';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <BridgeProvider>{children}</BridgeProvider>
      </body>
    </html>
  );
}
```

## 4. Add the callback route

Next.js needs a route handler for Bridge to redirect back to. Create it with the ready-made factory:

```ts
// app/auth/oauth-callback/route.ts
import { createBridgeCallbackRoute } from '@nebulr-group/bridge-nextjs/server';

export const GET = createBridgeCallbackRoute({ redirectPath: '/' });
```

The handler exchanges the OAuth code for tokens automatically and redirects to `redirectPath`.

## 5. That's it: no login page needed

With hosted auth, Bridge automatically redirects unauthenticated users to the Bridge hosted login UI. When the user completes authentication on the hosted page, they are redirected back to the callback route you created in step 4.

You do not need to create any login or signup pages.

## 6. Configuration

The config `<BridgeProvider>` uses is a `BridgeConfig`. The most common fields:

| Field | Default | Description |
|-------|---------|-------------|
| `appId` | **(required)** | Your Bridge app ID |
| `callbackUrl` | `<origin>/auth/oauth-callback` | Where the hosted login page redirects back to |
| `defaultRedirectRoute` | `'/'` | Route to land on after login |
| `loginRoute` | (unset) | In-app login route; leave unset for hosted auth (that's what triggers the hosted page) |
| `apiBaseUrl` | `https://api.thebridge.dev` | Root URL for the Bridge API (dev override) |
| `hostedUrl` | `https://auth.thebridge.dev` | Bridge hosted UI URL (dev override) |
| `debug` | `false` | Enable debug logging |

See the [Configuration reference](/auth/config/) for the full list (token storage, signup route, billing routes).

Rather than hardcoding environment-specific values, keep them in a `.env.local` file; the SDK reads them automatically (the `NEXT_PUBLIC_` prefix is required for values to reach the browser):

```env
NEXT_PUBLIC_BRIDGE_APP_ID=your-app-id-here
NEXT_PUBLIC_BRIDGE_DEFAULT_REDIRECT_ROUTE=/dashboard
```

You can also pass the same fields as a `config` prop on `<BridgeProvider>`; env values win when both are set:

```tsx
<BridgeProvider config={{ defaultRedirectRoute: '/dashboard' }}>
  {children}
</BridgeProvider>
```

## Next steps

- **In-app auth forms**: if you want to embed login/signup forms directly in your app instead of using the hosted page, see the [SDK auth quickstart](../sdk-auth/sdk-quickstart.md).
- **Theming**: customize the look of Bridge components with CSS variables and overrides. See [Theming & Styles](../theming/theming.md).
- **Going further**: add [feature flags](/feature-flags/how-it-works/), [billing and subscriptions](/billing/how-it-works/), or explore the full [Auth](/auth/) section.
