# nBlocks Next.js Quickstart Guide

## Step 1: Installation
Install the nblocks nextjs plugin

```bash
npm install @nebulr/nblocks-nextjs
```

## Step 2: Configuration
Add the NblocksProvider directly to your app layout with your app ID:

```tsx
// app/layout.tsx
import { NblocksProvider } from '@nebulr/nblocks-nextjs/client';

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

That's it! Your app is now protected with nBlocks authentication. All routes are protected by default, and users will be redirected to login when they try to access protected content.

## Optional: Advanced Configuration

### Adding Login Functionality

The simplest way to add login functionality to your app is to use the `useAuth` hook:

```tsx
// app/components/LoginButton.tsx
import { useAuth } from '@nebulr/nblocks-nextjs/client';

export default function LoginButton() {
  const { login } = useAuth();
  
  return (
    <button onClick={() => login()}>
      Sign In
    </button>
  );
}
```

### Configuring Callback URL

1. Go to the nBlocks Control Center:
   - Navigate to Authentication -> Authentication -> Security
   - Change the callback URL to: `https://your-app.com/nblocks/auth/oauth-callback`
   - For local development: `http://localhost:3000/nblocks/auth/oauth-callback`

The callback is automatically handled by the plugin - no additional setup needed!

### Server-Side Route Protection (Optional)

For additional server-side protection, you can add middleware:

```tsx
// middleware.ts
import { withNblocksAuth } from '@nebulr/nblocks-nextjs/server';

export default withNblocksAuth({
  rules: [
    { match: '/', public: true },
    { match: '/login', public: true },
    // All other routes are protected by default
  ]
});

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ]
};
```

### Environment Variables (Alternative)

Instead of passing `appId` as a prop, you can use environment variables:

```bash
# .env.local
NEXT_PUBLIC_NBLOCKS_APP_ID=your_app_id_here
```

Then use the provider without the appId prop:

```tsx
<NblocksProvider>
  {children}
</NblocksProvider>
```

## That's it!

You have now set up a complete authentication flow with nBlocks in your Next.js application!
Go ahead and give it a try by clicking the login button, signup with a new account and login with it.

There is a lot more the nblocks-nextjs plugin can do. And you can see many examples [here](examples.md)