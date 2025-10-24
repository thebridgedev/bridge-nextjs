# nBlocks Next.js Examples

## Table of Contents
- [Authentication](#authentication)
  - [Adding a Login Button](#adding-a-login-button)
  - [Renewing User Tokens](#renewing-user-tokens)
  - [Checking Authentication Status](#checking-if-a-user-is-logged-in)
  - [Getting User Profile Information](#getting-user-profile-information)
  - [Route Protection](#route-protection)
  - [Advanced Route Configuration](#advanced-route-configuration)
  - [Configuring OAuth Callback URL](#configuring-oauth-callback-url)
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

### Adding a Login Button

The simplest way to add login functionality to your app is to use the `useAuth` hook:

```tsx
// app/components/LoginButton.tsx
'use client';

import { useAuth } from '@nebulr-group/nblocks-nextjs/client';

export default function LoginButton() {
  const { login, logout, isAuthenticated } = useAuth();
  
  return (
    <div>
      {isAuthenticated ? (
        <button onClick={() => logout()}>
          Sign Out
        </button>
      ) : (
        <button onClick={() => login()}>
          Sign In
        </button>
      )}
    </div>
  );
}
```

### Route Protection

nBlocks provides several ways to protect routes in your Next.js application:

#### Middleware Protection (Recommended)

The most comprehensive way to protect routes is using the `withNblocksAuth` middleware:

```tsx
// middleware.ts
import { withNblocksAuth } from '@nebulr-group/nblocks-nextjs/server';

export default withNblocksAuth({
  rules: [
    { match: '/', public: true },
    { match: '/login', public: true },
    { match: '/about', public: true },
    { match: '/auth/oauth-callback', public: true },
    // All other routes are protected by default
  ]
});

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ]
};
```

This approach:
- Protects all routes by default (unless `defaultAccess: 'public'` is set)
- Allows you to specify public routes that don't require authentication
- Handles redirects automatically
- Works with both client and server components
- Automatically reads configuration from environment variables

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

### Advanced Route Configuration

#### Understanding defaultAccess

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

#### Using Regular Expressions for Route Matching

You can use regex patterns for more flexible route matching:

```tsx
export default withNblocksAuth({
  rules: [
    { match: new RegExp('^/public'), public: true },  // All /public/* routes
    { match: new RegExp('^/api/public'), public: true }, // All public API routes
    { match: new RegExp('^/docs($|/)'), public: true },  // /docs and /docs/* routes
  ]
});
```

### Configuring OAuth Callback URL

After setting up your middleware, you need to configure the OAuth callback URL in the nBlocks Control Center:

1. Go to the [nBlocks Control Center](https://admin.nblocks.cloud)
2. Navigate to: **Authentication → Authentication → Security**
3. Set the callback URL to match your application:
   - **Production**: `https://your-app.com/auth/oauth-callback`
   - **Local Development**: `http://localhost:3000/auth/oauth-callback`

The callback route is automatically handled by the `withNblocksAuth` middleware - no additional setup needed!

> **Note**: Make sure to include the `/auth/oauth-callback` route as public in your middleware rules, or it will be protected and authentication won't work.

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

nBlocks configuration is primarily set through environment variables in your `.env.local` file. 

#### Required Configuration

| Variable Name | Description |
|---------------|-------------|
| `NEXT_PUBLIC_NBLOCKS_APP_ID` | Your nBlocks application ID (get this from the Control Center → Keys) |

#### Optional Configuration

All these settings have sensible defaults and are optional:

| Variable Name | Description | Default Value |
|---------------|-------------|---------------|
| `NEXT_PUBLIC_NBLOCKS_AUTH_BASE_URL` | Base URL for nBlocks auth services | `https://auth.nblocks.cloud` |
| `NEXT_PUBLIC_NBLOCKS_CALLBACK_URL` | Custom OAuth callback URL | Auto-determined from origin |
| `NEXT_PUBLIC_NBLOCKS_DEFAULT_REDIRECT_ROUTE` | Route to redirect to after login | `/` |
| `NEXT_PUBLIC_NBLOCKS_LOGIN_ROUTE` | Route for login page | `/login` |
| `NEXT_PUBLIC_NBLOCKS_TEAM_MANAGEMENT_URL` | URL for team management portal | nBlocks default portal |
| `NEXT_PUBLIC_NBLOCKS_DEBUG` | Enable debug logging | `false` |

#### Example Configuration Files

**Minimal `.env.local` (recommended):**
```env
# Only the app ID is required - everything else uses defaults
NEXT_PUBLIC_NBLOCKS_APP_ID=your-app-id-here
```

**Full `.env.local` (with all optional settings):**
```env
# Required
NEXT_PUBLIC_NBLOCKS_APP_ID=your-app-id-here

# Optional: Custom auth base URL
NEXT_PUBLIC_NBLOCKS_AUTH_BASE_URL=https://auth.nblocks.cloud

# Optional: Custom callback URL
NEXT_PUBLIC_NBLOCKS_CALLBACK_URL=/auth/oauth-callback

# Optional: Default redirect route after login
NEXT_PUBLIC_NBLOCKS_DEFAULT_REDIRECT_ROUTE=/dashboard

# Optional: Login route for unauthenticated users
NEXT_PUBLIC_NBLOCKS_LOGIN_ROUTE=/auth/login

# Optional: Team management portal URL
NEXT_PUBLIC_NBLOCKS_TEAM_MANAGEMENT_URL=https://backendless.nblocks.cloud/user-management-portal/users

# Optional: Enable debug mode for detailed logging
NEXT_PUBLIC_NBLOCKS_DEBUG=true
```

> **Configuration Priority**: Environment variables take highest priority, followed by props passed to the provider, then default values.

### Additional Configs

You can also provide configuration directly through props (though environment variables are recommended):

#### Passing appId as a Prop

```tsx
// app/layout.tsx
import { NblocksProvider } from '@nebulr-group/nblocks-nextjs/client';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <NblocksProvider appId={process.env.NEXT_PUBLIC_NBLOCKS_APP_ID!}>
          {children}
        </NblocksProvider>
      </body>
    </html>
  );
}
```

#### Passing Full Config Object

```tsx
// app/layout.tsx
import { NblocksProvider } from '@nebulr-group/nblocks-nextjs/client';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <NblocksProvider
          config={{
            appId: 'your-app-id',
            callbackUrl: '/custom-callback',
            defaultRedirectRoute: '/dashboard',
            loginRoute: '/signin',
            debug: true
          }}
        >
          {children}
        </NblocksProvider>
      </body>
    </html>
  );
}
```

#### Middleware Configuration

Similarly, you can pass configuration to the middleware:

```tsx
// middleware.ts
import { withNblocksAuth } from '@nebulr-group/nblocks-nextjs/server';

export default withNblocksAuth({
  appId: 'your-app-id', // Optional - reads from NEXT_PUBLIC_NBLOCKS_APP_ID by default
  debug: true,          // Optional - enable debug logging
  rules: [
    { match: '/', public: true },
  ]
});
```

> **Note**: Environment variables take highest priority. If both an environment variable and a prop are provided, the environment variable will be used.



