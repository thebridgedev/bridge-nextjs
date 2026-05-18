# Bridge Next.js — Feature Flags Prompt

You are integrating feature flags from **`@nebulr-group/bridge-nextjs`** into a Next.js 15+ App Router project. Feature flags can be checked on the client (React components / hooks) and on the server (route handlers, server components, middleware).

## Prerequisites

- The integration prompt is complete.
- Flag definitions exist in the Bridge admin UI.

## Client-side: `<FeatureFlag>` component

```tsx
'use client';
import { FeatureFlag } from '@nebulr-group/bridge-nextjs/client';

export default function HomePage() {
  return (
    <>
      <h1>Welcome</h1>
      <FeatureFlag
        flagName="beta-dashboard"
        fallback={<p>Stable dashboard</p>}
      >
        <p>Beta dashboard preview</p>
      </FeatureFlag>
    </>
  );
}
```

## Client-side: `useFeatureFlag` hook

```tsx
'use client';
import { useFeatureFlag } from '@nebulr-group/bridge-nextjs/client';

export function ConditionalButton() {
  const isOn = useFeatureFlag('new-checkout');
  if (!isOn) return null;
  return <button>Try the new checkout</button>;
}
```

## Server-side: `<ServerFeatureFlag>` component

Use in server components for SSR-safe conditional rendering:

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

## Server-side: middleware

```ts
import { withBridgeAuth, withFeatureFlag } from '@nebulr-group/bridge-nextjs/server';

export default withBridgeAuth({
  rules: [
    { match: '/beta', public: false, featureFlag: 'beta-routes' },
    { match: '/', public: true },
  ],
});
```

## Reading the flag map directly

For advanced use (analytics, conditional API calls), read the live store:

```tsx
'use client';
import { useFlagsStore } from '@nebulr-group/bridge-nextjs/client';

export function FlagDebugger() {
  const flags = useFlagsStore();
  return <pre>{JSON.stringify(flags, null, 2)}</pre>;
}
```

## Integration checklist

- [ ] Flag definitions created in Bridge admin UI.
- [ ] At least one `<FeatureFlag>` or `useFeatureFlag()` call exists.
- [ ] Server-side flags use `ServerFeatureFlag` / `requireFeatureFlagForRoute` / middleware rules.

## Verify

1. Define a flag `demo-flag` in the Bridge admin UI, set it to `true` for your test user.
2. Mount `<FeatureFlag flagName="demo-flag">…</FeatureFlag>` somewhere.
3. Sign in as the test user — the wrapped content renders.
4. Sign in as a different user (flag off) — the fallback renders.
