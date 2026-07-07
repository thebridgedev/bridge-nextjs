# User & team management

## TeamManagementPanel

A drop-in panel for managing team members, team profile, and workspace settings. Renders three tabs: **Users**, **Profile**, and **Workspace**.

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `defaultTab` | `'users' \| 'profile' \| 'workspace'` | `'users'` | Which tab is active by default |
| `showProfileTab` | `boolean` | `true` | Show the profile tab |
| `showWorkspaceTab` | `boolean` | `true` | Show the workspace tab |
| `onError` | `(error: Error) => void` | — | Called on any error |
| `tabBar` | `(ctx: { tabs, activeTab, setTab }) => ReactNode` | — | Custom tab bar render function |

**Usage:**

```tsx
// app/settings/team/page.tsx
'use client';
import { TeamManagementPanel } from '@nebulr-group/bridge-nextjs/client';

export default function TeamPage() {
  return (
    <TeamManagementPanel
      defaultTab="users"
      onError={(err) => console.error(err)}
    />
  );
}
```

**Custom tab bar:**

```tsx
<TeamManagementPanel>
  {({ tabs, activeTab, setTab }) => (
    <nav className="custom-tabs">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          className={activeTab === tab.id ? 'active' : ''}
          onClick={() => setTab(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  )}
</TeamManagementPanel>
```

> `tabBar` is passed as the `tabBar` prop (a render function), not as `children` — see the props table above.

The panel includes:
- **Users tab** — list team members, invite new users, update roles, remove members.
- **Profile tab** — update the current user's first/last name.
- **Workspace tab** — update workspace name/locale settings.

## Individual tab components

Each tab is also exported as a standalone component. Use these when you only need one piece of team management, or want to build your own layout:

```tsx
'use client';
import { TeamUserList, TeamProfileForm, TeamWorkspaceForm } from '@nebulr-group/bridge-nextjs/client';

export default function CustomTeamLayout() {
  return (
    <div className="grid grid-cols-2 gap-8">
      {/* Just the user list */}
      <TeamUserList onError={(err) => console.error(err)} />

      <div>
        {/* Just the profile form */}
        <TeamProfileForm onError={(err) => console.error(err)} />

        {/* Just the workspace settings */}
        <TeamWorkspaceForm onError={(err) => console.error(err)} />
      </div>
    </div>
  );
}
```

All three accept standard `HTMLAttributes<HTMLDivElement>` (`className`, `style`, etc.) plus `onError`.

Internally, all four components call `getBridgeAuth().team.*` — the same methods are available directly if you build a fully custom UI: `listUsers()`, `listUserRoles()`, `createUsers(emails)`, `updateUser({ id, role, enabled })`, `deleteUser(id)`, `sendPasswordResetLink(id)`, `getProfile()`, `updateProfile({ firstName, lastName })`, `getWorkspace()`, `updateWorkspace({ name, locale })`.
