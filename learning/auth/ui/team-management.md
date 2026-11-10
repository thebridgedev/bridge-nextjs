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
| `seatsMetric` | `string` | (none) | The plan limit that counts seats, e.g. `"seats"`. With it, Invite stops at the plan's limit and says why. See [Seat limits](#seat-limits) |
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

## Seat limits

When a plan sells seats ("2 seats on Free, 5 on Pro"), the seat count is a plan limit the app names, `seats` here, like any other limit. It is a gauge that Bridge counts from workspace membership: the active members plus pending invites. There is no built-in `users` metric.

1. Put the limit on each plan, counted from membership: `bridge plan quota set <plan> --metric seats --limit N --policy hard --kind gauge --source membership` (MCP: `set_plan_quota` with `kind: "gauge"`, `source: "membership"`).
2. Pass the metric to the team page:

```tsx
<TeamManagementPanel seatsMetric="seats" />
```

With `seatsMetric`, **Invite** stops at the plan's limit and the line under it says why, with an upgrade link; the count is re-read after every invite, removal, enable or disable. `<TeamUserList seatsMetric="seats" />` does the same on its own. Without it, nothing changes and no quota is read.

Bridge's invite API does not refuse at the limit, so the check runs where the invite starts: `seatsMetric` on the built-in team page, or `@RequireQuota('seats')` on your own backend's invite handler. A seat count is a number, so it is a plan limit: never gate seats with a flag or an entitlement.

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

All three accept `className`, `style`, and `onError` props. `<TeamUserList>` also takes `seatsMetric`.
