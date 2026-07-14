# Target anonymous visitors

The SDK manages identity for you:

- On first load in the browser, it generates an anonymous ID and persists it —
  anonymous visitors get stable bucketing for A/B tests and percentage rollouts.
- With Bridge auth enabled, the session identity (the token's `sub`) is used
  automatically and pre-login activity is linked on login.

## Where the anonymous ID lives

The persistence mode is configurable. The default is `persistent` (localStorage)
in the browser; you can override it when you create the flags instance directly
via `createBridgeFlags`:

| Mode | Storage | Behavior |
|---|---|---|
| `persistent` (default) | `localStorage` | Survives tabs and reloads — the same visitor buckets consistently across sessions |
| `session` | `sessionStorage` | Per-tab; resets when the tab closes |
| `none` | in-memory | Never persisted; a fresh ID each page load |

```tsx
import { createBridgeFlags } from '@nebulr-group/bridge-nextjs/client';

const { bridge, stop } = createBridgeFlags({
  identity: { tracking: 'session' }, // or 'persistent' | 'none'
});
```

Most apps never call `createBridgeFlags` — `<BridgeProvider>` bootstraps flags
with the default `persistent` tracking. Reach for it only when you need a
non-default storage mode or a standalone instance.

## Server-side and anonymous visitors

Server-side evaluation builds identity from the request's token claims. A request
with **no token** has no identity, so backend mode returns the safe default for
any rule that needs to bucket a rollout (`rolloutPct < 100`) — by design. The
browser, which always has a persisted anonymous ID, buckets rolled-out rules
consistently even before sign-in; keep a sensible `defaultValue` / `fallback` for
the server path.
