# bridge Next.js Quickstart Guide

## Step 1: Installation
Install the bridge nextjs plugin

```bash
npm install @nebulr-group/bridge-nextjs
```

## Step 2: Configure Environment Variables
Create a `.env.local` file in your project root and add your bridge app ID:

```env
NEXT_PUBLIC_BRIDGE_APP_ID=your-app-id-here
```

> **Note:** You can find your app ID in the bridge Control Center by navigating to 'Keys' section.

## Step 3: Add Client Provider
Add the BridgeProvider to your app layout. It will automatically read configuration from your environment variables:

```tsx
// app/layout.tsx
import { BridgeProvider } from '@nebulr-group/bridge-nextjs/client';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <BridgeProvider>
          {children}
        </BridgeProvider>
      </body>
    </html>
  );
}
```

## Step 4: Add Route Protection (Middleware)

Create a `middleware.ts` file in your `src` directory to protect your routes:

```tsx
// src/middleware.ts
import { withBridgeAuth } from '@nebulr-group/bridge-nextjs/server';

export default withBridgeAuth({
  rules:[
    { match: '/auth/oauth-callback', public: true },
  ]
  
  //If you have pages that do not require login here is examples of how to make them public
  // rules: [
  //   { match: '/', public: true },              // Home page is public
  //   { match: '/login', public: true },          // Login page is public
  //   { match: '/auth/oauth-callback', public: true }, // OAuth callback
  //   // All other routes are protected by default
  // ]
});

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ]
};
```

## That's it!

You have now set up a complete authentication flow with bridge in your Next.js application!

There is a lot more the bridge-nextjs plugin can do. See [examples](examples.md) for advanced configuration, feature flags, and more.