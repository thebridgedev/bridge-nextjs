# nBlocks Next.js Quickstart Guide

## Installation
Install the nblocks nextjs plugin

```bash
npm install @nebulr/nblocks-nexts
```

## Configuration
Add the variable NEXT_PUBLIC_NBLOCKS_APP_ID to your .env file

> **Note:** You can find your app ID in the nBlocks Control Center by navigating to 'Keys' section.

Add the NblocksProvider to your app:

```tsx
// app/providers.tsx
import { NblocksProvider } from '@nebulr/nblocks-nextjs';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <NblocksProvider>
      {children}
    </NblocksProvider>
  );
}
```

## Authentication

### Redirecting to nblocks login

The simplest way to add login functionality to your app is to use the `useAuth` hook:

```tsx
// app/components/LoginButton.tsx
import { useAuth } from '@nebulr/nblocks-nextjs';

export default function LoginButton() {
  const { login } = useAuth();
  
  return (
    <button onClick={() => login()}>
      Sign In
    </button>
  );
}
```

### Handling the callback

After a user logs in through nBlocks, they'll be redirected back to your application. You need to set up a callback route to handle this redirect:

1. First, go to the nBlocks Control Center:
   - Navigate to Authentication -> Authentication -> Security
   - Change the callback URL to point to your application with the path `/auth/oauth-callback`
   - For example: `https://your-app.com/auth/oauth-callback` or `localhost:3000/auth/oauth-callback`
   - **Important**: The path you specify here (`/auth/oauth-callback`) must match exactly where you create your server-side route

2. Now create a server-side route in your Next.js application:
   - The route must be located at the exact path you specified in the control center
   - For the example above, create the file at `app/auth/oauth-callback/route.ts`

```tsx
// app/auth/oauth-callback/route.ts
import { createNblocksCallbackRoute } from '@nebulr/nblocks-nextjs/server';

export const GET = createNblocksCallbackRoute({
  redirectPath: '/',
  errorRedirectPath: '/?error=auth_failed'
});
```

### Protecting routes

To protect routes in your Next.js application, you need to set up middleware that uses the nBlocks authentication middleware:

```tsx
// middleware.ts
import { withAuth } from '@nebulr/nblocks-nextjs/server';
import { NextRequest } from 'next/server';

// Create the auth middleware
const authMiddleware = withAuth({
  // Public paths that don't require authentication
  publicPaths: ['/', '/login', '/auth/oauth-callback'],
});

// Export the middleware function
export async function middleware(request: NextRequest) {
  // Let the auth middleware handle all path protection logic
  return authMiddleware(request);
}

// Configure which paths the middleware should run on
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ]
};
```

You have now set up a complete authentication flow with nBlocks in your Next.js application!
Go ahead and give it a try by clicking the login button, signup with a new account and login with it.


There is a lot more the nblocks-nextjs plugin can do. And you can see many examples [here](examples.md)