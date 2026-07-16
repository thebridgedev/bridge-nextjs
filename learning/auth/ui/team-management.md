# User & team management

## TeamManagementPanel

A drop-in panel for managing team members, team profile, and workspace settings. Renders three tabs: **Users**, **Profile**, and **Workspace**.

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `defaultTab` | `'users' \| 'profile' \| 'workspace'` | `'users'` | Which tab is active by default |
| `showProfileTab` | `boolean` | `true` | Show the profile tab |
| `showWorkspaceTab` | `boolean` | `true` | Show the workspace tab |
| `onError` | `(error: Error) => void` | (none) | Called on any error |
| `tabBar` | `(ctx: { tabs, activeTab, setTab }) => ReactNode` | (none) | Custom tab bar render function |

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
<TeamManagementPanel
  tabBar={({ tabs, activeTab, setTab }) => (
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
/>
```

The panel includes:
- **Users tab**: list team members, invite new users, update roles, remove members.
- **Profile tab**: update team name and other profile fields.
- **Workspace tab**: update workspace settings.

## Individual tab components

Each tab is also exported as a standalone component. Use these when you only need one piece of team management, or want to build your own layout:

```tsx
'use client';
import { TeamUserList, TeamProfileForm, TeamWorkspaceForm } from '@nebulr-group/bridge-nextjs/client';

export default function CustomTeamLayout() {
  return (
    <>
      {/* Just the user list */}
      <TeamUserList onError={(err) => console.error(err)} />

      {/* Just the profile form */}
      <TeamProfileForm onError={(err) => console.error(err)} />

      {/* Just the workspace settings */}
      <TeamWorkspaceForm onError={(err) => console.error(err)} />
    </>
  );
}
```

All three accept `className`, `style`, and `onError` props.
