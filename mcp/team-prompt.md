# Bridge Next.js — Team Management Prompt

You are integrating the in-app team management UI from **`@nebulr-group/bridge-nextjs`**. The SDK team panel renders directly inside your app — there is **no handover redirect** to a separate portal.

## Decide first — how much do you want to build?

| You want | Use | Effort |
|---|---|---|
| A complete team settings page | `<TeamManagementPanel />` | One component |
| The plans sell seats ("2 seats on Free, 5 on Pro") | `<TeamManagementPanel seatsMetric="seats" />` + a `seats` limit on each plan | One prop — see **Seat limits** |
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
- The current user must be authenticated. Who may manage the team is decided by a flag ruled on a privilege — see **Who sees the team page** below — never by a role check in the code.

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

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `defaultTab` | `'users' \| 'profile' \| 'workspace'` | `'users'` | Which tab is active by default |
| `showProfileTab` | `boolean` | `true` | Show the profile tab |
| `showWorkspaceTab` | `boolean` | `true` | Show the workspace tab |
| `onError` | `(error: Error) => void` | — | Called on any error |
| `seatsMetric` | `string` | — | The plan limit that counts seats, e.g. `"seats"`. With it, Invite stops at the plan's limit and says why. See **Seat limits** below |
| `tabBar` | `(ctx: { tabs, activeTab, setTab }) => ReactNode` | — | Custom tab bar |

## Seat limits — when a plan sells seats

Seats are a plan limit the app names, `seats` here, like any other limit. It is a gauge that Bridge counts from workspace membership: the active members plus pending invites, read fresh however members are added or removed. There is no built-in `users` metric and no seat logic in Bridge. A seat count is a number, so it is a plan limit; never gate seats with a flag or an entitlement.

1. **Put the limit on each plan**, counted from membership:

```bash
bridge plan quota set <plan> --metric seats --limit N --policy hard --kind gauge --source membership
```

For "2 seats on Free, 5 on Pro": `bridge plan quota set free --metric seats --limit 2 --policy hard --kind gauge --source membership`, then the same for `pro` with `--limit 5`. (MCP: `set_plan_quota` with `metric: "seats"`, `policy: "hard"`, `kind: "gauge"`, `source: "membership"`.)

2. **Ask the user where invites start**: Bridge's built-in team page, or the app's own invite handler? Each answer is one line:
   - **Built-in team page**: `<TeamManagementPanel seatsMetric="seats" />` (or `<TeamUserList seatsMetric="seats" />`). Invite stops at the plan's limit and the line under it explains why, with the upgrade link. The count is re-read after every invite, removal, enable or disable.
   - **The app's own invite handler**: `@RequireQuota('seats')` on that backend handler. It checks the seat limit and writes nothing, because Bridge counts the members.

3. **Bridge's invite API does not refuse at the limit.** The check runs where the invite starts, which is why step 2 matters. Without `seatsMetric` the team page invites past the limit.

## Who sees the team page

Not everyone in a workspace should manage its members, so the team page and its nav link are gated. Like every gate in app code, that gate is a flag ruled on a privilege — never a role list in the code such as `['OWNER','ADMIN'].includes(role)`.

1. **Read the app's real roles first**: `list_roles` (MCP) or `bridge role list` (CLI). What a role can do is only "in the default setup"; pick the privilege the roles that should manage members actually hold (in the default setup, `USER_WRITE`).
2. **Create the flag** `team-management`, ruled on that privilege:

```bash
bridge flag create --key team-management --value-type boolean --state on-with-rule \
  --rule '{"branches":[{"conditions":[{"attribute":"privileges","operator":"contains","values":["USER_WRITE"]}],"returnValue":true}],"otherwiseValue":false,"rolloutPct":100}'
```

(MCP: `create_feature_flag` with the same rule as a structured object.) `contains` on `privileges` is exact membership.

3. **Gate the page.** Hosted login: a rule on `withBridgeAuth` in `middleware.ts` — an edit to an existing rule for that path if there is one — `{ match: '/team', featureFlag: 'team-management' }`. SDK auth (sign-in in the browser): wrap the page's content in the flag inside `<ProtectedRoute>`:

```tsx
'use client';
import { FeatureFlag, ProtectedRoute, TeamManagementPanel } from '@nebulr-group/bridge-nextjs/client';

export default function TeamPage() {
  return (
    <ProtectedRoute redirectTo="/auth/login">
      <FeatureFlag flagKey="team-management" defaultValue={false} fallback={<p>You can't manage this team.</p>}>
        <TeamManagementPanel seatsMetric="seats" />
      </FeatureFlag>
    </ProtectedRoute>
  );
}
```

4. **Gate the nav link** with the same flag:

```tsx
<FeatureFlag flagKey="team-management" defaultValue={false}>
  <a href="/team">Team</a>
</FeatureFlag>
```

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
- [ ] Protected by middleware or `<ProtectedRoute>`, and gated by the `team-management` flag (a privilege rule), never a role check.
- [ ] If the plans sell seats: a `seats` limit on each plan and `seatsMetric="seats"` on the panel (or `@RequireQuota('seats')` on your own invite handler).
- [ ] Linked from your app's navigation, the link inside the same flag.
- [ ] `npx @nebulr-group/bridge-cli check gates` reports nothing.
- [ ] **No legacy handover code remains.**

## Verify

1. Sign in with a role that holds the privilege the `team-management` flag asks for.
2. Navigate to `/team`.
3. The "Users" tab loads the team member list.
4. Click "Add Member" — dialog opens, accepts comma/newline-separated emails.
5. Switch to "Profile" tab — fields populate from `getProfile()`, save persists.
6. Switch to "Workspace" tab — workspace name + locale editable, plan + MFA shown as read-only.
7. If the plans sell seats and the page has `seatsMetric="seats"`: on a plan with 2 seats and 2 members, Invite is disabled and says all seats are taken.
8. Signed in with a role that does not hold the privilege, the nav link is hidden and the page shows the fallback (or middleware refuses it).
