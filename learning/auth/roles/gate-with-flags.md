# Gate features by role or privilege

Role and privilege are both available as feature flag targeting attributes automatically, decoded from the JWT — no wiring, no context you have to pass by hand.

| Attribute | Value | Example |
|-----------|-------|---------|
| `user.role` | the role key | `"ENTERPRISE_BETA"` |
| `privileges` | array of privilege keys | `["USER_READ", "BETA_REPORTS"]` |

## Continuing the enterprise example

Following on from [Common role setups](/auth/roles/common-setups/) — a flag `beta_reports` with a rule targeting the role directly:

```
user.role eq "ENTERPRISE_BETA"
```

or targeting the privilege instead:

```
privileges contains "BETA_REPORTS"
```

Either way, the client component doesn't change — read it with `useFlag()`:

```tsx
'use client';
import { useFlag } from '@nebulr-group/bridge-nextjs/client';

export function BetaReportsSection() {
  const betaReports = useFlag('beta_reports', false);

  if (!betaReports.value) return null;
  return <BetaReportsPanel />;
}
```

Targeting the role is simpler when the role only ever means one thing. Targeting the privilege scales better if several different roles might eventually need the same access — grant them the privilege instead of duplicating the flag rule per role.

## Gating a Server Component instead

`useFlag()` is client-only (`'use client'`). To gate a Server Component or redirect away from one on the server, use `<ServerFeatureFlag>` from `@nebulr-group/bridge-nextjs/server` — it evaluates the same rule (role/privilege attributes included, decoded from the request's cookies) before the page renders:

```tsx
// app/reports/page.tsx
import { ServerFeatureFlag } from '@nebulr-group/bridge-nextjs/server';

export default function ReportsPage() {
  return (
    <ServerFeatureFlag flagName="beta_reports" fallback={<UpgradeBanner />}>
      <BetaReportsPanel />
    </ServerFeatureFlag>
  );
}
```
