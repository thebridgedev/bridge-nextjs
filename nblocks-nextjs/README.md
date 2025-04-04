# nBlocks Next.js Integration

This library provides a seamless integration between Next.js applications and the nBlocks platform, offering authentication, feature flags, and team management capabilities.

## Installation

```bash
npm install nblocks-nextjs
# or
yarn add nblocks-nextjs
```

## Quick Start

### 1. Set up the Provider

Wrap your application with the `NblocksProvider` component:

```tsx
// app/providers.tsx
'use client';

import { NblocksProvider } from 'nblocks-nextjs';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <NblocksProvider
      config={{
        appId: process.env.NEXT_PUBLIC_NBLOCKS_APP_ID || '',
        authBaseUrl: process.env.NEXT_PUBLIC_NBLOCKS_AUTH_BASE_URL,
        callbackUrl: process.env.NEXT_PUBLIC_NBLOCKS_CALLBACK_URL,
      }}
    >
      {children}
    </NblocksProvider>
  );
}

// app/layout.tsx
import { Providers } from './providers';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

### 2. Set up Authentication

#### Login Component

```tsx
// app/login/page.tsx
'use client';

import { Login } from 'nblocks-nextjs';

export default function LoginPage() {
  return (
    <div>
      <h1>Login</h1>
      <Login>Login with nBlocks</Login>
    </div>
  );
}
```

#### Callback Handler

```tsx
// app/auth/callback/page.tsx
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { handleCallbackFromUrl } from 'nblocks-nextjs';

export default function CallbackPage() {
  const router = useRouter();
  
  useEffect(() => {
    const processCallback = async () => {
      try {
        await handleCallbackFromUrl();
        router.push('/dashboard');
      } catch (error) {
        console.error('Authentication error:', error);
        router.push('/login');
      }
    };
    
    processCallback();
  }, [router]);
  
  return <div>Processing authentication...</div>;
}
```

### 3. Use Authentication Hooks

```tsx
'use client';

import { useAuth } from 'nblocks-nextjs';

export default function ProfilePage() {
  const { isAuthenticated, isLoading, logout } = useAuth();
  
  if (isLoading) {
    return <div>Loading...</div>;
  }
  
  return (
    <div>
      <h1>Profile</h1>
      {isAuthenticated ? (
        <div>
          <p>You are logged in</p>
          <button onClick={logout}>Logout</button>
        </div>
      ) : (
        <p>You are not logged in</p>
      )}
    </div>
  );
}
```

### 4. Set up Middleware

```tsx
// middleware.ts
import { withAuth } from 'nblocks-nextjs';

export default withAuth({
  config: {
    appId: process.env.NBLOCKS_APP_ID || '',
    authBaseUrl: process.env.NBLOCKS_AUTH_BASE_URL,
    loginRoute: '/login'
  },
  publicPaths: ['/login', '/auth/callback', '/public']
});
```

## Features

### Authentication

- OAuth2 login flow
- Token management and auto-renewal
- Protected routes via middleware
- Login/logout functionality

### Feature Flags (Coming Soon)

- Client-side feature flag evaluation
- Server-side feature flag evaluation
- Feature gate components

### Team Management (Coming Soon)

- Team member management
- Role-based access control
- Team invites

## API Reference

### Components

#### `NblocksProvider`

Provider component that initializes the nBlocks configuration.

```tsx
<NblocksProvider config={config}>
  {children}
</NblocksProvider>
```

#### `Login`

Component for handling login.

```tsx
<Login config={config} redirectUri={redirectUri}>
  Login with nBlocks
</Login>
```

### Hooks

#### `useAuth`

Hook for authentication state and operations.

```tsx
const { isAuthenticated, isLoading, login, logout } = useAuth(config);
```

### Utilities

#### `handleCallbackFromUrl`

Utility for handling the OAuth callback.

```tsx
await handleCallbackFromUrl(config);
```

### Middleware

#### `withAuth`

Middleware for protecting routes at the Next.js middleware level.

```tsx
export default withAuth({
  config: {
    appId: process.env.NBLOCKS_APP_ID || '',
    authBaseUrl: process.env.NBLOCKS_AUTH_BASE_URL,
    loginRoute: '/login'
  },
  publicPaths: ['/login', '/auth/callback']
});
```

## License

MIT 