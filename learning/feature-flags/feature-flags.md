# Feature Flags

Conditional rendering and access control driven by Bridge feature flags.

## Define flags

Create flag definitions in the Bridge admin UI. Each flag has:
- A unique key (e.g. `beta-dashboard`).
- A targeting rule (per-user, per-tenant, all-on, etc.).
- A boolean evaluation per request.

## Client-side: `<FeatureFlag>` component

```tsx
'use client';
import { FeatureFlag } from '@nebulr-group/bridge-nextjs/client';

<FeatureFlag flagName="beta-dashboard" fallback={<p>Stable dashboard</p>}>
  <p>Beta dashboard preview</p>
</FeatureFlag>
```

Reads from cached flags (5-minute cache by default). For live evaluation:

```tsx
<FeatureFlag flagName="beta-dashboard" forceLive>
  <BetaDashboard />
</FeatureFlag>
```

## Client-side: `useFeatureFlag` hook

```tsx
'use client';
import { useFeatureFlag } from '@nebulr-group/bridge-nextjs/client';

export function CTA() {
  const isOn = useFeatureFlag('new-checkout');
  return isOn ? <NewCheckout /> : <LegacyCheckout />;
}
```

## Server-side: `<ServerFeatureFlag>`

For SSR-safe conditional rendering in server components:

```tsx
import { ServerFeatureFlag } from '@nebulr-group/bridge-nextjs/server';

export default function Page() {
  return (
    <ServerFeatureFlag flagName="beta-dashboard">
      <BetaDashboard />
    </ServerFeatureFlag>
  );
}
```

## Server-side: API routes

```ts
import { requireFeatureFlagForRoute } from '@nebulr-group/bridge-nextjs/server';

export async function GET(request: Request) {
  const denied = await requireFeatureFlagForRoute(request, 'beta-api');
  if (denied) return denied;
  return Response.json({ ok: true });
}
```

## Reading the full flag map

```tsx
'use client';
import { useFlagsStore } from '@nebulr-group/bridge-nextjs/client';

const flags = useFlagsStore();
// { 'beta-dashboard': true, 'new-checkout': false, ... }
```

## Caching

- Cached flags live in memory for 5 minutes per flag.
- `forceLive` skips the cache and hits the Bridge API on every render.
- Server-side flags are evaluated per-request (no cache).

## Common pitfalls

- **Flags before authentication:** the client-side flag map is empty until the user is authenticated. Use `<FeatureFlag>` with a `fallback` so unauthenticated users see the stable variant.
- **Flag names must match exactly** what's in the Bridge admin UI. Typos silently return `false`.
