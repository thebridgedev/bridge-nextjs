# Bridge Next.js — Team Management Prompt

You are integrating the in-app team management UI from **`@nebulr-group/bridge-nextjs`**. The SDK team panel renders directly inside your app — there is **no handover redirect** to a separate portal.

## Decide first — how much do you want to build?

| You want | Use | Effort |
|---|---|---|
| A complete team settings page | `<TeamManagementPanel />` | One component |
| The same panel, fewer tabs | `<TeamManagementPanel showProfileTab={false} showWorkspaceTab={false} />` | One prop each |
| The same panel, your own tab bar | `<TeamManagementPanel tabBar={…} />` | One prop |
| Only the member list | `<TeamUserList />` | One component |
| Only the profile or workspace form | `<TeamProfileForm />`, `<TeamWorkspaceForm />` | One each |
| Your own layout on Bridge's pieces | `<TeamAddUserDialog />`, `<TeamEditUserDialog />`, `<TeamConfirmDialog />`, `<TeamUserActionsMenu />`, `useTenantUsers()` | Moderate |
| Your own everything | `getBridgeAuth().team.*` directly | Last resort |

**Start at the top and only move down when a requirement forces it.** The panel already handles invite, role change, removal, confirmation dialogs, loading and error states, and stays correct as the role model changes.

> **Do not build team CRUD in your own backend and proxy to it.** These components talk to Bridge directly with the signed-in user's token, and Bridge enforces who may do what. A proxy adds a hop, a second place for role logic to drift, and a new way to leak another workspace's members.

> **The team page must be guarded, and which guard depends on your auth mode.** Hosted login → `withBridgeAuth` in `middleware.ts`. SDK auth → `<ProtectedRoute>`, because the middleware cannot see a browser-held session and lets the request through. See the integration prompt. Everything here is client-side: `'use client'`, importing from `@nebulr-group/bridge-nextjs/client`.

## Prerequisites

- The integration prompt is complete.
- The current user must be authenticated and have permission to manage their tenant's team (typically `admin` role).

## Migration check

If you previously used a handover-based pattern (`POST /handover/code/{appId}` + iframe to a cloud-views team portal), **remove it**. The SDK panel replaces that flow entirely.

## Wire the team page

Create `app/team/page.tsx`:

```tsx
'use client';
import { TeamManagementPanel } from '@nebulr-group/bridge-nextjs/client';

export default function TeamPage() {
  return (
    <TeamManagementPanel
      defaultTab="users"
      showProfileTab
      showWorkspaceTab
      onError={(err) => console.error('Team error', err)}
    />
  );
}
```

That's it. The panel handles:
- Listing team members (with role + status badges).
- Adding new members (`<TeamAddUserDialog>`).
- Editing roles + enable/disable (`<TeamEditUserDialog>`).
- Resetting passwords.
- Deleting users (with confirmation).
- Editing the current user's profile (`<TeamProfileForm>`).
- Editing workspace settings (`<TeamWorkspaceForm>`).

## Granular usage

If you don't want all three tabs, mount sub-components directly:

```tsx
'use client';
import { TeamUserList, TeamProfileForm } from '@nebulr-group/bridge-nextjs/client';

export default function MyTeamPage() {
  return (
    <>
      <h1>Team</h1>
      <TeamUserList />
      <hr />
      <h2>My profile</h2>
      <TeamProfileForm />
    </>
  );
}
```

## Custom tab bar

```tsx
<TeamManagementPanel
  tabBar={({ tabs, activeTab, setTab }) => (
    <div className="my-tabs">
      {tabs.map(tab => (
        <button
          key={tab.id}
          className={activeTab === tab.id ? 'active' : ''}
          onClick={() => setTab(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )}
/>
```

## Auth-core methods used internally

The panel calls these auth-core methods (via `getBridgeAuth().team.*`):
- `listUsers()`, `listUserRoles()`
- `createUsers(emails)`
- `updateUser({ id, role, enabled })`
- `deleteUser(id)`
- `sendPasswordResetLink(id)`
- `getProfile()`, `updateProfile({ firstName, lastName })`
- `getWorkspace()`, `updateWorkspace({ name, locale })`

You can call any of these directly if you build a custom UI on top.

## Integration checklist

- [ ] `app/team/page.tsx` mounts `<TeamManagementPanel />`.
- [ ] Protected by middleware or `<ProtectedRoute>`.
- [ ] Linked from your app's navigation.
- [ ] **No legacy handover code remains.**

## Verify

1. Sign in as an admin.
2. Navigate to `/team`.
3. The "Users" tab loads the team member list.
4. Click "Add Member" — dialog opens, accepts comma/newline-separated emails.
5. Switch to "Profile" tab — fields populate from `getProfile()`, save persists.
6. Switch to "Workspace" tab — workspace name + locale editable, plan + MFA shown as read-only.
