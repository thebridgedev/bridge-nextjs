# Multi-tenancy

Bridge has first-class multi-tenant architecture: a user can belong to more than one **tenant** (also called a **workspace** — Bridge and these docs use both words for the same thing).

The same login credentials get a user into every tenant they belong to, but everything tenant-scoped is configured *separately* per tenant — role, plan, entitlements, quotas, and branding can all differ. The same person can be `ADMIN` in one workspace and `OWNER` in another, signing in with the exact same email and password either way.

`bridge.user.role` (see [Getting the user token](/auth/user-token/getting-the-token/)) always reflects that person's role in whichever tenant is currently active — switch tenants and it updates to the role they hold there. Roles are assigned per tenant too — see [Assign roles to users](/auth/roles/assign-roles/).

## The active tenant

The current workspace is exposed live on the unified `bridge` surface:

```tsx
'use client';
import { useBridge, useBridgeReadable } from '@nebulr-group/bridge-nextjs/client';

export function WorkspaceLabel() {
  const bridge = useBridge();
  const name = useBridgeReadable(bridge.tenant.name);
  const id = useBridgeReadable(bridge.tenant.id);

  return <p>Workspace: {name} ({id})</p>;
}
```

`bridge.tenant.*` is kept current over the live channel — when an admin renames the workspace or changes its plan, the values update without a reload.

## Selecting a tenant after login

When a user has more than one **enabled** membership in an **active** tenant, `LoginForm` surfaces a `TenantSelector` step automatically so they pick which workspace to enter. You don't wire anything — it appears when `authState` becomes `'tenant-selection'`. See [Auth states](/auth/user-token/auth-states/) for the full list of states.

Both conditions matter: a membership that's been disabled, or a tenant that isn't active (for example, suspended for non-payment), doesn't count and won't show up as an option — even though the underlying tenant-user record still exists. A user with memberships in three tenants but only one enabled-and-active goes straight in, no selector shown.

## Switching tenants

A drop-in `<WorkspaceSelector>` component lists the workspaces the signed-in user can access and switches the active one — the same enabled-and-active filter from tenant selection at login applies here too. On switch, the SDK re-issues a session for the chosen tenant and the whole `bridge` surface re-snapshots — including that person's role, which may not be the same in the new tenant as it was in the last one. See [Switching workspaces](/auth/ui/switching-workspaces/) in UI components for the full prop list and custom-row example.

## Isolation

Tenant isolation is enforced **server-side**, not in the client:

- Every SDK request carries the active workspace's session; the backend authorizes against that tenant only. A token minted for workspace A can never read workspace B's data.
- Switching workspace mints a fresh session for the target tenant — the client never "merges" data across tenants.
- Feature-flag evaluation, quotas, and entitlements are all scoped to the active tenant, so the same flag key can resolve differently per workspace.

This matters doubly in Next.js: the `bridge_access_token` cookie that `middleware.ts` and Server Components read (see [Getting the user token](/auth/user-token/getting-the-token/#reading-the-token-on-the-server)) is scoped to whichever tenant was active when it was issued. A server-side check always authorizes against that tenant — there's no way for a request to reach across workspaces by forging a different tenant ID client-side.

## Under the hood

- **Re-snapshot on switch** — switching workspace replaces the entire session snapshot (user role in that tenant, subscription, entitlements, branding) in one push; reads via `useBridgeReadable` update together with no half-applied state.
- **Live tenant updates** — `tenant.updated`-style events keep `bridge.tenant.*` current while you stay in a workspace; subscribe via `bridge.events.handle({...})` if you need a side effect at the moment it changes — see [How the user token is updated](/auth/user-token/object-updates/).
- **One source of identity** — `bridge.user` is the person; `bridge.tenant` is the workspace they're currently acting in. The pair is what every authorization decision is made against.
