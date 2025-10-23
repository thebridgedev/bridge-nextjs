# nBlocks Next.js Examples

## Table of Contents
- [Authentication](#authentication)
  - [Renewing User Tokens](#renewing-user-tokens)
  - [Checking Authentication Status](#checking-if-a-user-is-logged-in)
  - [Getting User Profile Information](#getting-user-profile-information)
  - [Route Protection](#route-protection)
- [Feature Flags](#feature-flags)
  - [Bulk Fetching vs Live Updates](#bulk-fetching-vs-live)
  - [Basic Feature Flag Usage](#a-basic-feature-flag)
  - [Live Feature Flag Updates](#live-getting-a-feature-flag)
  - [Conditional Rendering with Feature Flags](#if-else-if-a-featureflag-is-disabled-then-show-this)
  - [Route Protection with Feature Flags](#feature-flags-on-routes)
  - [Server-Side Feature Flags](#feature-flags-on-server-side-code-like-apis)
- [Server-Side Rendering](#server-side-rendering)
- [Configuration](#configuration)
  - [Getting Config Values](#getting-config-values)
  - [Environment Variables](#environment-variables)
  - [Additional Configs](#additional-configs)

## Authentication

### Route Protection

nBlocks provides several ways to protect routes in your Next.js application:

#### Middleware Protection (Recommended)

The most comprehensive way to protect routes is using middleware:

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

This approach:
- Protects all routes by default
- Allows you to specify public paths that don't require authentication
- Handles redirects automatically
- Works with both client and server components

#### Component-Based Protection

For more granular control, you can use the `ProtectedRoute` component:

```tsx
// app/dashboard/page.tsx
import { ProtectedRoute } from '@nebulr/nblocks-nextjs';

export default function DashboardPage() {
  return (
    <ProtectedRoute>
      <div>
        <h1>Dashboard</h1>
        <p>This content is only visible to authenticated users</p>
      </div>
    </ProtectedRoute>
  );
}
```

#### Server-Side Protection

For server components, you can use the `ServerAuthCheck` component:

```tsx
// app/dashboard/page.tsx
import { ServerAuthCheck } from '@nebulr/nblocks-nextjs/server';

export default function DashboardPage() {
  return (
    <ServerAuthCheck redirectTo="/login">
      <div>
        <h1>Dashboard</h1>
        <p>This content is only visible to authenticated users</p>
      </div>
    </ServerAuthCheck>
  );
}
```

### Renewing User Tokens

nBlocks automatically handles token renewal for you. The token service will refresh tokens before they expire to ensure a seamless user experience.

```tsx
// The token service handles renewal automatically
// You can monitor token status with the useAuth hook
import { useAuth } from '@nebulr/nblocks-nextjs';

function TokenStatus() {
  const { isAuthenticated, isLoading } = useAuth();
  
  if (isLoading) return <div>Loading authentication status...</div>;
  
  return (
    <div>
      {isAuthenticated ? 'Authenticated' : 'Not authenticated'}
    </div>
  );
}
```

### Checking if a User is Logged In

You can use the `useAuth` hook to check if a user is currently logged in:

```tsx
import { useAuth } from '@nebulr/nblocks-nextjs';

function AuthStatus() {
  const { isAuthenticated, isLoading } = useAuth();
  
  if (isLoading) return <div>Loading...</div>;
  
  return (
    <div>
      {isAuthenticated ? (
        <div>You are logged in!</div>
      ) : (
        <div>Please log in to continue</div>
      )}
    </div>
  );
}
```

### Getting User Profile Information

Access the current user's profile information using the `useAuth` hook:

```tsx
import { useAuth } from '@nebulr/nblocks-nextjs';

function UserProfile() {
  const { user, isLoading } = useAuth();
  
  if (isLoading) return <div>Loading profile...</div>;
  
  if (!user) return <div>No user logged in</div>;
  
  return (
    <div>
      <h2>User Profile</h2>
      <p>Email: {user.email}</p>
      <p>Name: {user.name}</p>
      <p>ID: {user.id}</p>
    </div>
  );
}
```

## Feature Flags

### Bulk Fetching vs Live

nBlocks provides two ways to work with feature flags:

1. **Bulk Fetching (Recommended)**: Get all feature flags at once and use them throughout your application. This approach uses a 5-minute cache to improve performance.
2. **Live Updates**: Check feature flags individually with real-time updates, bypassing the cache.

The recommended approach is to use bulk fetching with caching for better performance:

```tsx
// Bulk fetching example - RECOMMENDED APPROACH
import { useFeatureFlagsContext } from '@nebulr/nblocks-nextjs';

function FeatureFlagsPanel() {
  const { flags, refreshFlags } = useFeatureFlagsContext();
  
  return (
    <div>
      <button onClick={refreshFlags}>Refresh Flags</button>
      <ul>
        {Object.entries(flags).map(([key, enabled]) => (
          <li key={key}>
            {key}: {enabled ? 'Enabled' : 'Disabled'}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

When using the `FeatureFlag` component without the `forceLive` prop, it will use the cached values:

```tsx
// Using cached feature flags (recommended for better performance)
import { FeatureFlag } from '@nebulr/nblocks-nextjs';

function CachedFeatureExample() {
  return (
    <div>
      <h3>Cached Feature Flag</h3>
      <p>Uses cached values (5-minute cache)</p>
      <FeatureFlag 
        flagName="demo-flag"
        fallback={<div>Feature flag "demo-flag" is disabled</div>}
      >
        <div>
          <p>Feature flag "demo-flag" is active</p>
        </div>
      </FeatureFlag>
    </div>
  );
}
```

For cases where you need real-time updates, you can use the `forceLive` prop:

```tsx
// Live feature flag example (bypasses cache)
import { FeatureFlag } from '@nebulr/nblocks-nextjs';

function LiveFeatureExample() {
  return (
    <div>
      <h3>Live Feature Flag</h3>
      <p>Direct API call on each load</p>
      <FeatureFlag 
        flagName="demo-flag"
        forceLive={true}        
      >
        <div>
          <p>Feature flag "demo-flag" is active</p>
        </div>
      </FeatureFlag>
    </div>
  );
}
```

### If, else, if a featureflag is disabled then show this

Use the `FeatureFlag` component with the `negate` prop to show content when a flag is disabled:

```tsx
import { FeatureFlag } from '@nebulr/nblocks-nextjs';

function ConditionalContent() {
  return (
    <div>
      <FeatureFlag flagName="new-ui">
        <div>New UI Content</div>
      </FeatureFlag>
      
      <FeatureFlag flagName="new-ui" negate>
        <div>Legacy UI Content</div>
      </FeatureFlag>
    </div>
  );
}
```

You can also use the `fallback` prop to provide alternative content:

```tsx
import { FeatureFlag } from '@nebulr/nblocks-nextjs';

function FeatureWithFallback() {
  return (
    <FeatureFlag 
      flagName="premium-feature" 
      fallback={<div>Upgrade to premium to access this feature</div>}
    >
      <div>Premium Feature Content</div>
    </FeatureFlag>
  );
}
```

### Feature flags on routes

Protect entire routes with feature flags using middleware:

```tsx
// middleware.ts
import { withFeatureFlags } from '@nebulr/nblocks-nextjs/server';
import { NextRequest } from 'next/server';

// Define feature flag protections
const featureFlagProtections = [
  {
    flag: 'premium-feature',
    paths: ['/premium/*'],
    redirectTo: '/upgrade',
  },
  {
    flag: 'beta-feature',
    paths: ['/beta/*'],
    redirectTo: '/',
  }
];

// Create the middleware
const featureFlagMiddleware = withFeatureFlags(featureFlagProtections);

// Export the middleware function
export async function middleware(request: NextRequest) {
  return featureFlagMiddleware(request);
}

// Configure which paths the middleware should run on
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ]
};
```

### Feature flags on server side code like apis

Use feature flags in server-side code, including API routes:

```tsx
// app/api/premium/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { isFeatureEnabledServer } from '@nebulr/nblocks-nextjs/server';

export async function GET(request: NextRequest) {
  // Get the access token from the request
  const accessToken = request.headers.get('Authorization')?.replace('Bearer ', '');
  
  if (!accessToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  // Check if the premium feature is enabled for this user
  const isPremiumEnabled = await isFeatureEnabledServer('premium-feature', accessToken);
  
  if (!isPremiumEnabled) {
    return NextResponse.json(
      { error: 'This feature requires a premium subscription' }, 
      { status: 403 }
    );
  }
  
  // Return premium data
  return NextResponse.json({ 
    data: 'Premium content',
    message: 'You have access to premium features'
  });
}
```

#### Error Handling in Server-Side Code

You can customize error handling for feature flag checks:

```tsx
// app/api/feature/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { isFeatureEnabledServer } from '@nebulr/nblocks-nextjs/server';

export async function GET(request: NextRequest) {
  try {
    const accessToken = request.headers.get('Authorization')?.replace('Bearer ', '');
    
    if (!accessToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const isFeatureEnabled = await isFeatureEnabledServer('my-feature', accessToken);
    
    if (!isFeatureEnabled) {
      // Custom error response
      return NextResponse.json(
        { 
          error: 'Feature not available',
          code: 'FEATURE_DISABLED',
          message: 'This feature is currently disabled for your account'
        }, 
        { status: 403 }
      );
    }
    
    return NextResponse.json({ data: 'Feature enabled content' });
  } catch (error) {
    console.error('Feature flag error:', error);
    return NextResponse.json(
      { error: 'Internal server error' }, 
      { status: 500 }
    );
  }
}
```

## Server-Side Rendering


For feature flags in server components:

```tsx
// app/premium/page.tsx
import { ServerFeatureFlag } from '@nebulr/nblocks-nextjs/server';

export default function PremiumPage() {
  return (
    <ServerFeatureFlag 
      flagName="premium-feature" 
      fallback={<div>Upgrade to premium to access this content</div>}
    >
      <div>
        <h1>Premium Content</h1>
        <p>This content is only visible to users with the premium feature enabled</p>
      </div>
    </ServerFeatureFlag>
  );
}
```

## Configuration

### Getting Config Values

Access configuration values in your application:

```tsx
import { useNblocksConfig } from '@nebulr/nblocks-nextjs';

function ConfigDisplay() {
  const config = useNblocksConfig();
  
  return (
    <div>
      <h2>nBlocks Configuration</h2>
      <p>App ID: {config.appId}</p>
      <p>Auth Base URL: {config.authBaseUrl}</p>
      <p>Callback URL: {config.callbackUrl}</p>
    </div>
  );
}
```

### Environment Variables

nBlocks configuration values are primarily set through environment variables in your `.env` file. Here are the available configuration variables:

| Variable Name | Description | Default Value |
|---------------|-------------|---------------|
| `NEXT_PUBLIC_NBLOCKS_APP_ID` | Your nBlocks application ID | (Required) |
| `NEXT_PUBLIC_NBLOCKS_CALLBACK_URL` | URL for OAuth callback | (Optional) |
| `NEXT_PUBLIC_NBLOCKS_DEFAULT_REDIRECT_ROUTE` | Default route after login | `/` |
| `NEXT_PUBLIC_NBLOCKS_LOGIN_ROUTE` | Route for login page | `/login` |
| `NEXT_PUBLIC_NBLOCKS_DEBUG` | Enable debug mode | `false` |

Example `.env` file:

```env
# Required
NEXT_PUBLIC_NBLOCKS_APP_ID=your-app-id-here

# Optional (will use defaults if not set)
NEXT_PUBLIC_NBLOCKS_CALLBACK_URL=/auth/oauth-callback
NEXT_PUBLIC_NBLOCKS_DEFAULT_REDIRECT_ROUTE=/dashboard
NEXT_PUBLIC_NBLOCKS_LOGIN_ROUTE=/login
NEXT_PUBLIC_NBLOCKS_DEBUG=false
```

### Additional Configs

You can also provide configuration when initializing the NblocksProvider:

```tsx
// app/providers.tsx
import { NblocksProvider } from '@nebulr/nblocks-nextjs';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <NblocksProvider
      config={{        // Override default configuration        
        callbackUrl: '/custom-callback',
        defaultRedirectRoute: '/dashboard',
        loginRoute: '/signin'
      }}
    >
      {children}
    </NblocksProvider>
  );
}
```

Configuration provided through the `NblocksProvider` will override values from environment variables.



