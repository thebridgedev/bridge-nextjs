---
title: How the user token is updated
description: How role, plan, and permission changes reach your app live, and what happens offline.
sidebar:
  label: Next.js
---

# How the user token is updated

Once `<BridgeProvider>` connects, your app is subscribed to a live channel for as long as it's open. When an admin changes something about the signed-in user server-side — their role, their workspace's plan, a permission — Bridge pushes that change down the channel and refreshes the session automatically. `bridge.user` (and every other snapshot slice) updates in place. There's no reload, no polling, and nothing to wire up beyond reading it reactively.

## Example: a role change reaching your UI live

```tsx
'use client';
import { useBridge, useBridgeReadable } from '@nebulr-group/bridge-nextjs/client';

export function AdminGate({ children }: { children: React.ReactNode }) {
  const bridge = useBridge();
  const user = useBridgeReadable(bridge.user);

  if (user?.role !== 'ADMIN') {
    return <p>You don&apos;t have access to this area.</p>;
  }
  return <>{children}</>;
}
```

If an admin changes this user's role from `MEMBER` to `ADMIN` in the Control Center, `user.role` updates on its own and `<AdminGate>` re-renders — no refresh, because the component reads the live `bridge.user` readable rather than a value captured once on mount. Structure your gated UI this way (read via `useBridgeReadable(bridge.user)`, not a snapshot stashed in `useState`) and it stays correct automatically.

## Reacting to the exact moment something changes

For a side effect at the moment of change — a toast, an analytics event, an audit log — subscribe on the unified events dispatcher, `bridge.events`:

```ts
import { bridge } from '@nebulr-group/bridge-nextjs/client';

const unsubscribe = bridge.events.handle({
  'user.state_changed': (msg) => toast(`Your access changed: ${msg.reason}`),
  'session.snapshot': (msg) => console.log('Session refreshed', msg.data),
});
```

`bridge.events.handle(...)` returns an `unsubscribe` function — call it (e.g. from a `useEffect` cleanup) when the subscribing component unmounts.

## What happens while your app is offline

If the live channel drops (network blip, laptop sleep, server restart), the snapshot slices **freeze at their last-known values** — nothing clears, nothing errors. Bridge doesn't have anything new to tell you, so it doesn't tell you anything.

When the channel reconnects, two things happen automatically:

1. Bridge proactively refreshes your tokens, in case a role/plan change was broadcast while you were disconnected and missed.
2. The server sends a fresh session snapshot, which atomically overwrites every slice (`bridge.user`, `bridge.tenant`, entitlements) in one update — so you're back in sync even if several things changed while you were offline.

You can watch the connection itself if you want to show an offline indicator:

```tsx
'use client';
import { useRealtimeStatus } from '@nebulr-group/bridge-nextjs/client';

export function ConnectionBanner() {
  const status = useRealtimeStatus(); // 'idle' | 'connecting' | 'open' | 'closed'

  if (status === 'closed') return <p role="status">You&apos;re offline — reconnecting…</p>;
  return null;
}
```

`useRealtimeStatus()` is the React-idiomatic surface; a Svelte-store-compatible `realtimeStatus.subscribe(...)` is also exported for plain TypeScript code outside components.
