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

### Optional Environment Variables
You can also configure these optional settings:

```env
# Optional: Custom auth base URL (defaults to https://auth.nblocks.cloud)
NEXT_PUBLIC_NBLOCKS_AUTH_BASE_URL=https://auth.nblocks.cloud

# Optional: Default redirect route after login (defaults to /)
NEXT_PUBLIC_NBLOCKS_DEFAULT_REDIRECT_ROUTE=/dashboard

# Optional: Login route for unauthenticated users (defaults to /login)
NEXT_PUBLIC_NBLOCKS_LOGIN_ROUTE=/auth/login

# Optional: Enable debug mode (defaults to false)
NEXT_PUBLIC_NBLOCKS_DEBUG=true
```

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

> **Alternative - Using Props:**
> You can still pass the appId directly as a prop if you prefer: `<NblocksProvider appId="YOUR_APP_ID">`
> Props will be overridden by environment variables if both are present.

## Step 4: Add Route Protection (Middleware)

Create a `middleware.ts` file in your `src` directory to protect your routes:

```tsx
// src/middleware.ts
import { withNblocksAuth } from '@nebulr-group/nblocks-nextjs/server';

export default withNblocksAuth({
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

> **Note:** The middleware automatically reads the appId from `NEXT_PUBLIC_NBLOCKS_APP_ID`. You can also pass it explicitly: `withNblocksAuth({ appId: 'YOUR_APP_ID', rules: [...] })`

That's it! Your app is now protected with nBlocks authentication. All routes (except those marked as `public`) are protected, and unauthenticated users will be redirected to the nBlocks login page.

### Understanding defaultAccess

By default, any route not specified in the `rules` array is **protected** (requires authentication). You can change this behavior with the `defaultAccess` parameter:

```tsx
// Option 1: Protect by default (default behavior)
export default withNblocksAuth({
  defaultAccess: 'protected', // This is the default
  rules: [
    { match: '/', public: true },
    { match: '/login', public: true },
    // All other routes require authentication
  ]
});

// Option 2: Public by default, protect specific routes
export default withNblocksAuth({
  defaultAccess: 'public', // All unmatched routes are public
  rules: [
    { match: '/dashboard', public: false }, // Require auth for dashboard
    { match: '/profile', public: false },    // Require auth for profile
    // All other routes are public
  ]
});
```

## Step 5: Configure Callback URL

1. Go to the nBlocks Control Center:
   - Navigate to Authentication -> Authentication -> Security
   - Change the callback URL to: `https://your-app.com/nblocks/auth/oauth-callback`
   - For local development: `http://localhost:3000/nblocks/auth/oauth-callback`

The callback is automatically handled by the plugin - no additional setup needed!

## Step 6: Advanced Configuration (Optional)

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