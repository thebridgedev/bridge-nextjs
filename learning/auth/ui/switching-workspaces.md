# Switching workspaces

Two components cover workspace selection (a workspace is called a *tenant* in the API, which is why some identifiers below say `tenant`):

- **`TenantSelector`**: part of the login flow. Lets a user pick which workspace to sign in to.
- **`WorkspaceSelector`**: for an already signed-in user. Lets them switch the active workspace, for example from a settings page or sidebar.

Both only come into play when the user has **more than one enabled membership in an active tenant**. A membership that's been disabled, or a workspace that isn't active (for example, suspended for non-payment), doesn't count and won't be shown. A user with exactly one enabled-and-active membership goes straight in with no selector.

## TenantSelector

Lets a user with multiple workspaces pick one during login. It appears automatically inside `LoginForm` when `authState` becomes `'tenant-selection'` (see [Auth states](/auth/user-token/auth-states/)), so you normally don't wire anything. Use it standalone only if you're building a custom login flow.

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `onSelect` | `() => void` | (none) | Called after a workspace is selected |
| `onError` | `(error: Error) => void` | (none) | Called on error |
| `tenantItem` | `(tenant: TenantUser) => ReactNode` | (none) | Custom render function for each workspace item |

**Standalone usage with a custom item:**

```tsx
'use client';
import { TenantSelector, useAuthState, type TenantUser } from '@nebulr-group/bridge-nextjs/client';
import { useRouter } from 'next/navigation';

export function CustomTenantStep() {
  const authState = useAuthState();
  const router = useRouter();

  if (authState !== 'tenant-selection') return null;
  return (
    <TenantSelector
      onSelect={() => router.push('/dashboard')}
      tenantItem={(tenant: TenantUser) => (
        <div className="tenant-card">
          <strong>{tenant.tenantName}</strong>
          <span>{tenant.role}</span>
        </div>
      )}
    />
  );
}
```

## WorkspaceSelector

A drop-in switcher that lists the workspaces the signed-in user can access and switches the active one. On switch, the SDK issues a fresh session for the chosen workspace and refreshes the whole `bridge` object in one update, including the user's role, which may differ in the new workspace.

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `onSwitch` | `() => void` | (none) | Called after the active workspace changes |
| `onError` | `(error: Error) => void` | (none) | Called on switch error |
| `workspaceItem` | `(ctx: { workspace, isActive, isLoading, onSelect }) => ReactNode` | (none) | Custom render function per workspace row |

**Usage:**

```tsx
'use client';
import { WorkspaceSelector } from '@nebulr-group/bridge-nextjs/client';
import { useRouter } from 'next/navigation';

export function WorkspaceSwitcher() {
  const router = useRouter();
  return (
    <WorkspaceSelector
      onSwitch={() => router.push('/')}
      onError={(err) => console.error(err)}
    />
  );
}
```

**Custom row markup**: supply a `workspaceItem` render function for full control. The `workspace` object carries the workspace's details under `workspace.tenant` (`id`, `name`, `logo`), plus the membership's `id`, `username`, and `fullName`:

```tsx
<WorkspaceSelector
  workspaceItem={({ workspace, isActive, isLoading, onSelect }) => (
    <button className={isActive ? 'active' : ''} disabled={isLoading} onClick={onSelect}>
      {workspace.tenant.name}{isActive ? ' ✓' : ''}
    </button>
  )}
/>
```

For the concept behind all of this (what a workspace is, how isolation works), see [Multi-tenancy](/auth/multi-tenancy/).
