# Bridge Next.js — Team Management Prompt

You are integrating the in-app team management UI from **`@nebulr-group/bridge-nextjs`**. The SDK team panel renders directly inside your app — there is **no handover redirect** to a separate portal.

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
