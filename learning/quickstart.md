# nBlocks Next.js Quickstart Guide

## Step 1: Installation
Install the nblocks nextjs plugin

```bash
npm install @nebulr-group/nblocks-nextjs
```

## Step 2: Configure Environment Variables
Create a `.env.local` file in your project root and add your nBlocks app ID:

```env
NEXT_PUBLIC_NBLOCKS_APP_ID=your-app-id-here
```

> **Note:** You can find your app ID in the nBlocks Control Center by navigating to 'Keys' section.

## Step 3: Add Client Provider
Add the NblocksProvider to your app layout. It will automatically read configuration from your environment variables:

```tsx
// app/layout.tsx
import { NblocksProvider } from '@nebulr-group/nblocks-nextjs/client';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <NblocksProvider>
          {children}
        </NblocksProvider>
      </body>
    </html>
  );
}
```

## Step 4: Add Route Protection (Middleware)

Create a `middleware.ts` file in your `src` directory to protect your routes:

```tsx
// src/middleware.ts
import { withNblocksAuth } from '@nebulr-group/nblocks-nextjs/server';

export default withNblocksAuth({
  rules:[
    { match: '/auth/oauth-callback', public: true },
  ]
  
  //If you have pages that do not require login here is examples of how to make them public
  // rules: [
  //   { match: '/', public: true },              // Home page is public
  //   { match: '/login', public: true },          // Login page is public
  //   { match: '/nblocks/auth/oauth-callback', public: true }, // OAuth callback
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

You have now set up a complete authentication flow with nBlocks in your Next.js application!

There is a lot more the nblocks-nextjs plugin can do. See [examples](examples.md) for advanced configuration, feature flags, and more.