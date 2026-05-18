# Authentication

How `@nebulr-group/bridge-nextjs` represents auth state, exposes hooks, and protects routes.

## How it works

`<BridgeProvider>` initializes a singleton `BridgeAuth` (from `@nebulr-group/bridge-auth-core`) on mount. Auth-core emits events:
- `auth:login` — when tokens are issued.
- `auth:logout` — when tokens are cleared.
- `auth:token-refreshed` — when refresh succeeds.
- `auth:state-change` — when the state machine transitions (`unauthenticated` → `mfa-required` → `tenant-selection` → `authenticated`).
- `auth:profile` — when the profile loads or updates.
- `auth:workspace-changed` — when the user switches workspaces.
- `auth:error` — on any auth error.

These events update a Zustand store (`useBridgeStore`) which all the hooks read from.

## Hooks

### `useAuth()`

```tsx
const { isAuthenticated, isLoading, error, authState, login, logout, handleCallback } = useAuth();
```

- `isAuthenticated` — boolean, derived from token presence.
- `isLoading` — `true` until bootstrap completes.
- `authState` — `'unauthenticated' | 'authenticating' | 'mfa-required' | 'mfa-setup-required' | 'tenant-selection' | 'authenticated'`.
- `login()` — redirects to hosted bridge auth.
- `logout()` — clears tokens and resets state.

### `useProfile()`

```tsx
const { profile, isLoading, error, updateProfile, isOnboarded, hasMultiTenantAccess } = useProfile();
```

`profile` is the auth-core `Profile` type — has `fullName`, `email`, `username`, `onboarded`, `multiTenantAccess`, etc.

### Other state hooks

- `useAuthState()` — just the state machine value.
- `useBridgeTokens()` — `TokenSet | null`.
- `useIsOnboarded()` — boolean.
- `useHasMultiTenantAccess()` — boolean.
- `useTenantUsers()` — `TenantUser[]` (populated during `tenant-selection`).
- `useBridgeReady()` — boolean, `true` once bootstrap finishes.

## Route protection

### Server-side (middleware)

```ts
// middleware.ts
import { withBridgeAuth } from '@nebulr-group/bridge-nextjs/server';

export default withBridgeAuth({
  rules: [
    { match: '/', public: true },
    { match: '/auth/:path*', public: true },
    // everything else requires authentication
  ],
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
```

When middleware blocks a request, it redirects to the configured `loginRoute` (default `/auth/login`).

### Client-side (`<ProtectedRoute>`)

```tsx
'use client';
import { ProtectedRoute } from '@nebulr-group/bridge-nextjs/client';

export default function DashboardPage() {
  return (
    <ProtectedRoute>
      <Dashboard />
    </ProtectedRoute>
  );
}
```

## Accessing the profile

```tsx
'use client';
import { useProfile } from '@nebulr-group/bridge-nextjs/client';

export function ProfileBadge() {
  const { profile } = useProfile();
  return <span>{profile?.fullName ?? profile?.email}</span>;
}
```

For a simple display name, use `<ProfileName />`:

```tsx
import { ProfileName } from '@nebulr-group/bridge-nextjs/client';
<ProfileName className="text-gray-700" />
```

## Authenticated API calls

```tsx
'use client';
import { getBridgeAuth } from '@nebulr-group/bridge-nextjs/client';

export async function fetchUser() {
  const token = await getBridgeAuth().getAccessToken();
  const res = await fetch('/api/me', {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.json();
}
```

## Logout flow

`logout()` clears localStorage + cookies, fires `auth:logout`, and resets all hooks to unauthenticated state. There's no redirect by default — the consumer can navigate after:

```tsx
const router = useRouter();
const { logout } = useAuth();
await logout();
router.push('/');
```

## Common pitfalls

- **`getBridgeAuth()` throws** if called before `<BridgeProvider>` has mounted. Always call it from `'use client'` components after mount.
- **OAuth callback preserves `?payment=*`** by default. If you add other query params your app needs after login, pass them to `createBridgeCallbackRoute({ preserveQueryParams: ['payment', 'ref'] })`.
- **MFA-setup-required state** is reachable only when the Bridge app forces MFA for new users. `<LoginForm>` handles it; if you wire a custom login UI, check `authState === 'mfa-setup-required'` and render `<MfaSetup />`.
