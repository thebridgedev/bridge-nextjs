# nBlocks Next.js

A Next.js library for integrating with nBlocks authentication services.

## Installation

```bash
npm install nblocks-nextjs
# or
yarn add nblocks-nextjs
```

## Client-Side Usage

### Configuration Provider

First, wrap your application with the `NblocksConfigProvider`:

```tsx
import { NblocksConfigProvider } from 'nblocks-nextjs';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <NblocksConfigProvider
      config={{
        appId: process.env.NEXT_PUBLIC_NBLOCKS_APP_ID!,
        // Other options are optional and will use defaults
      }}
    >
      {children}
    </NblocksConfigProvider>
  );
}
```

### Authentication Hook

```tsx
import { useAuth } from 'nblocks-nextjs';

export default function MyComponent() {
  const { isAuthenticated, login, logout } = useAuth();

  return (
    <div>
      {isAuthenticated ? (
        <button onClick={logout}>Logout</button>
      ) : (
        <button onClick={login}>Login</button>
      )}
    </div>
  );
}
```

### Login Component

```tsx
import { Login } from 'nblocks-nextjs';

export default function MyComponent() {
  return (
    <div>
      <Login />
    </div>
  );
}
```

## Server-Side Usage

### OAuth Callback Route

Create a file at `app/auth/callback/route.ts` in your Next.js app:

```tsx
import { createCallbackRoute } from 'nblocks-nextjs';

export const GET = createCallbackRoute({
  redirectPath: '/dashboard', // Optional: redirect to a different path after login
  errorRedirectPath: '/login?error=auth_failed' // Optional: custom error redirect
});
```

This will handle the OAuth callback, exchange the authorization code for tokens, and redirect the user to the specified path.

### Feature Flag Middleware

The library provides middleware for protecting routes with feature flags. The middleware can automatically detect API routes and return appropriate responses.

#### Basic Page Protection

```tsx
// app/protected-page/middleware.ts
import { requireFeatureFlag } from 'nblocks-nextjs/server/middleware/feature-flag-middleware';

export const middleware = requireFeatureFlag('my-feature-flag', '/fallback-page');
```

This will redirect users to `/fallback-page` if the feature flag is not enabled.

#### API Route Protection

```tsx
// app/api/protected-endpoint/middleware.ts
import { requireApiFeatureFlag } from 'nblocks-nextjs/server/middleware/feature-flag-middleware';

export const middleware = requireApiFeatureFlag('my-api-feature', {
  errorStatus: 403,
  errorMessage: 'This API endpoint requires the my-api-feature flag to be enabled'
});
```

This will return a 403 JSON response if the feature flag is not enabled.

#### Advanced Configuration

For more complex scenarios, you can use the `withFeatureFlags` function:

```tsx
// middleware.ts
import { withFeatureFlags } from 'nblocks-nextjs/server/middleware/feature-flag-middleware';

export const middleware = withFeatureFlags([
  {
    flag: 'premium-feature',
    paths: ['/premium/*'],
    redirectTo: '/upgrade',
    responseType: 'redirect'
  },
  {
    flag: 'beta-api',
    paths: ['/api/beta/*'],
    responseType: 'error',
    errorStatus: 403,
    errorMessage: 'This API is currently in beta'
  }
]);
```

This configuration protects multiple routes with different feature flags and response types.

## Environment Variables

Add the following environment variables to your `.env.local` file:

```
NEXT_PUBLIC_NBLOCKS_APP_ID=your_app_id
NEXT_PUBLIC_NBLOCKS_AUTH_BASE_URL=https://auth.nblocks.cloud
NEXT_PUBLIC_NBLOCKS_CALLBACK_URL=http://localhost:3000/auth/callback
```

## License

MIT 