# nBlocks Next.js Quickstart Guide

## Step 1: Installation
Install the nblocks nextjs plugin

```bash
npm install @nebulr-group/nblocks-nextjs
```

## Step 2: Add Client Provider
Add the NblocksProvider to your app layout with your app ID:

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
        <NblocksProvider appId="YOUR_APP_ID">
          {children}
        </NblocksProvider>
      </body>
    </html>
  );
}
```

> **Note:** You can find your app ID in the nBlocks Control Center by navigating to 'Keys' section.

## Step 3: Add Route Protection (Middleware)

Create a `middleware.ts` file in your `src` directory to protect your routes:

```tsx
// src/middleware.ts
import { withNblocksAuth } from '@nebulr-group/nblocks-nextjs/server';

export default withNblocksAuth({
  appId: 'YOUR_APP_ID', // Same app ID as above
  rules: [
    { match: '/', public: true },              // Home page is public
    { match: '/login', public: true },          // Login page is public
    { match: '/nblocks/auth/oauth-callback', public: true }, // OAuth callback
    // All other routes are protected by default
  ]
});

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ]
};
```

That's it! Your app is now protected with nBlocks authentication. All routes (except those marked as `public`) are protected, and unauthenticated users will be redirected to the nBlocks login page.

> **Alternative - Using Environment Variables:**
> If you prefer, you can set the `NEXT_PUBLIC_NBLOCKS_APP_ID` environment variable in a `.env.local` file and omit the `appId` parameter from both `NblocksProvider` and `withNblocksAuth`.

## Step 4: Configure Callback URL

1. Go to the nBlocks Control Center:
   - Navigate to Authentication -> Authentication -> Security
   - Change the callback URL to: `https://your-app.com/nblocks/auth/oauth-callback`
   - For local development: `http://localhost:3000/nblocks/auth/oauth-callback`

The callback is automatically handled by the plugin - no additional setup needed!

## Optional: Advanced Configuration

### Adding a Login Button

The simplest way to add login functionality to your app is to use the `useAuth` hook:

```tsx
// app/components/LoginButton.tsx
'use client';

import { useAuth } from '@nebulr-group/nblocks-nextjs/client';

export default function LoginButton() {
  const { login } = useAuth();
  
  return (
    <button onClick={() => login()}>
      Sign In
    </button>
  );
}
```


## That's it!

You have now set up a complete authentication flow with nBlocks in your Next.js application!
Go ahead and give it a try by clicking the login button, signup with a new account and login with it.

There is a lot more the nblocks-nextjs plugin can do. And you can see many examples [here](examples.md)