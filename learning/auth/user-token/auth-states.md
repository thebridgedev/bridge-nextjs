---
title: Auth states
description: Every state a signed-in (or signing-in) user can be in, and how to branch on it.
sidebar:
  label: Next.js
---

# Auth states

`authState` tells you exactly where a user is in the login flow — from "not signed in" through any in-progress step, to fully authenticated. It's what drives `LoginForm`'s multi-step behavior (MFA, tenant selection, etc.) automatically, and you can read the same value yourself via `useAuthState()` to build custom flows.

## The states

| State | Meaning |
|-------|---------|
| `'unauthenticated'` | No valid tokens — the user isn't signed in |
| `'credentials-validated'` | Email/password (or equivalent) passed; Bridge is deciding whether MFA or tenant selection is needed next |
| `'mfa-required'` | An MFA code challenge is pending |
| `'mfa-setup-required'` | The user must set up MFA before continuing (first-time enrollment) |
| `'tenant-selection'` | The user has access to more than one workspace and needs to pick one |
| `'authenticated'` | Fully signed in with valid tokens — the user can use the app |

Any state returns to `'unauthenticated'` on logout or if the tokens are cleared.

## Branching on it yourself

`LoginForm` handles all of this internally, so you only need this if you're building a custom login screen instead of using the drop-in component. It special-cases three of the states — anything else (including the brief `'credentials-validated'` step) falls through to the credentials form:

```tsx
'use client';
import { useAuthState, MfaChallenge, MfaSetup, TenantSelector } from '@nebulr-group/bridge-nextjs/client';

export function CustomLoginFlow() {
  const authState = useAuthState();

  if (authState === 'mfa-required') return <MfaChallenge onError={console.error} />;
  if (authState === 'mfa-setup-required') return <MfaSetup onError={console.error} />;
  if (authState === 'tenant-selection') return <TenantSelector onError={console.error} />;

  return <p>Sign in to continue…</p>; // your own credentials form goes here
}
```

## Checking just "am I logged in"

For the common case — gating a page or showing/hiding a nav item — you don't need the full state machine, just whether it resolved to `'authenticated'`. `useAuth()` covers that:

```tsx
'use client';
import { useAuth } from '@nebulr-group/bridge-nextjs/client';

export function NavAuthSlot() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) return <p>Loading...</p>;
  return isAuthenticated ? <p>You are logged in!</p> : <p>Please log in to continue.</p>;
}
```

`useAuth()`, `useAuthState()`, and the components above are all client-only (`'use client'`). For request-time protection before a page renders at all, see [Route guards](/auth/securing/route-guards/) — `withBridgeAuth` in `middleware.ts` checks authentication server-side, ahead of any of these client hooks running.
