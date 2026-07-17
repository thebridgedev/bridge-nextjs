---
title: Auth states
description: Every state a signed-in (or signing-in) user can be in, and how to branch on it.
sidebar:
  label: Next.js
---

# Auth states

`useAuthState()` is a single reactive hook that tells you exactly where a user is in the login flow, from "not signed in" through any in-progress step, to fully authenticated. It's what drives `LoginForm`'s multi-step behavior (MFA, workspace selection, etc.) automatically, and you can read the same state yourself to build custom flows.

## The states

| State | Meaning |
|-------|---------|
| `'unauthenticated'` | No valid tokens; the user isn't signed in |
| `'credentials-validated'` | Email/password (or equivalent) passed; Bridge is deciding whether MFA or workspace selection is needed next |
| `'mfa-required'` | An MFA code challenge is pending |
| `'mfa-setup-required'` | The user must set up MFA before continuing (first-time enrollment) |
| `'tenant-selection'` | The user has access to more than one workspace (called a *tenant* in the API) and needs to pick one |
| `'authenticated'` | Fully signed in with valid tokens; the user can use the app |

Any state returns to `'unauthenticated'` on logout or if the tokens are cleared. For how the tokens behind these states are stored, refreshed, and erased, see [Logging in and logging out](/auth/user-token/logging-in-and-out/).

## Branching on it yourself

`LoginForm` handles all of this internally, so you only need this if you're building a custom login screen instead of using the drop-in component:

```tsx
'use client';
import { useAuthState, MfaChallenge, MfaSetup, TenantSelector } from '@nebulr-group/bridge-nextjs/client';

export function CustomLoginFlow() {
  const authState = useAuthState();

  if (authState === 'unauthenticated') return <p>Please sign in.</p>;
  if (authState === 'credentials-validated') return <p>Checking your account…</p>;
  if (authState === 'mfa-required') return <MfaChallenge onVerified={() => {}} />;
  if (authState === 'mfa-setup-required') return <MfaSetup onComplete={() => {}} />;
  if (authState === 'tenant-selection') return <TenantSelector />;
  return <p>You're in.</p>; // 'authenticated'
}
```

## Checking just "am I signed in"

For the common case (gating a route or showing/hiding a nav item), you don't need the full state machine, just whether it resolved to `'authenticated'`. The `isAuthenticated` / `isLoading` values from `useAuth()` cover that:

```tsx
'use client';
import { useAuth } from '@nebulr-group/bridge-nextjs/client';

export function NavAuthSlot() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) return <p>Loading...</p>;
  if (isAuthenticated) return <p>You are logged in!</p>;
  return <p>Please log in to continue.</p>;
}
```
