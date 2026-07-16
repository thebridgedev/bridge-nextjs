---
title: How the user token is updated
description: How role, plan, and permission changes reach your app live, and what happens offline.
sidebar:
  label: Next.js
---

# How the user token is updated

Once `<BridgeProvider>` connects, your app is subscribed to a live channel (a persistent realtime connection the SDK maintains) for as long as it's open. When an admin changes something about the signed-in user server-side (their role, their workspace's plan, a permission), Bridge pushes that change down the channel and refreshes the session automatically. Your reactive stores update in place. There's no reload, no polling, and nothing to wire up beyond reading `bridge.user` reactively.

## Example: a role change reaching your UI live

```tsx
'use client';
import { useBridge, useBridgeReadable } from '@nebulr-group/bridge-nextjs/client';

export function AdminArea() {
  const bridge = useBridge();
  const user = useBridgeReadable(bridge.user);

  if (user?.role === 'ADMIN') return <AdminPanel />;
  return <p>You don't have access to this area.</p>;
}
```

If an admin changes this user's role from `MEMBER` to `ADMIN` in Control Center (your admin dashboard at app.thebridge.dev), `user.role` updates on its own and `<AdminPanel />` appears without a refresh, because the component is driven by the reactive `bridge.user` readable rather than a value read once on mount. Structure your gated UI this way (branch on the live readable, not a snapshot you captured earlier) and it stays correct automatically.

## Reacting to the exact moment something changes

For a side effect at the moment of change (a toast, an analytics event, an audit log), subscribe on the unified events dispatcher:

```ts
import { bridge } from '@nebulr-group/bridge-nextjs/client';

bridge.events.handle({
  'user.state_changed': (msg) => toast(`Your access changed: ${msg.reason}`),
  'session.snapshot': (msg) => console.log('Session refreshed', msg.data),
});
```

> **Framework note:** `bridge.events.handle(...)` returns an unsubscribe function; when subscribing from inside a component, call it in your `useEffect` cleanup so the handler doesn't outlive the component.

## What happens while your app is offline

If the live channel drops (network blip, laptop sleep, server restart), your stores **freeze at their last-known values**: nothing clears, nothing errors. Bridge doesn't have anything new to tell you, so it doesn't tell you anything.

When the channel reconnects, two things happen automatically:

1. Bridge proactively refreshes your tokens, in case a role/plan change was broadcast while you were disconnected and missed.
2. The server sends a fresh session snapshot (the full current state of the session), which atomically overwrites every part of the `bridge` object (`bridge.user`, `bridge.tenant`, subscription, entitlements) in one update, so you're back in sync even if several things changed while you were offline.

You can watch the connection itself if you want to show an offline indicator:

```ts
import { useRealtimeStatus } from '@nebulr-group/bridge-nextjs/client';
// 'idle' | 'connecting' | 'open' | 'closed'
```
