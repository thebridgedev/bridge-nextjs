# How flags work

A feature flag is a switch on a piece of behavior in your app that you control
from Control Center instead of from a deploy. Wrap something in a flag and you
can:

- **Ship dark** — merge and deploy a feature while it's still off for everyone,
  then turn it on when it's ready.
- **Roll out gradually** — turn it on for 10% of users, watch, then ramp to
  25%, 50%, 100%.
- **Target a segment** — turn it on only for a role, a plan, an internal
  cohort, or any attribute your app sends.
- **Kill it instantly** — something's wrong in production? Flip it off. No
  rollback, no redeploy.

Every one of those is an action you take in Control Center. Flip a flag there
and it reaches every connected app in about a second, live — no refresh, no
redeploy. That's possible because of how flags evaluate:

Bridge Feature Flags **evaluates locally**. The SDK keeps your flag rules in
memory, evaluates them against in-process context, and receives rule changes
live over a push channel. A flag check is an O(1) lookup — no network call — so
it's safe to call directly in render paths.

## Two sides: client and server

Next.js runs your app on both the client and the server, and flags evaluate on
each — from the same rules, with the same targeting.

- **Client** (`useFlag` / `<FeatureFlag>`, `'use client'`) — evaluates against a
  live in-memory cache that hydrates on bootstrap and rides the realtime channel.
  Flipping a flag updates the value in place, no refresh.
- **Server** (`<ServerFeatureFlag>`, middleware, route handlers) — evaluates in
  backend mode against the request's token claims, read from cookies, so a
  protected page or API route decides *before* it renders or responds.

Both sides read the same rules from Control Center; you pick the side by where
you need the decision. Guarding a route so unauthenticated users never see a
flash of protected content is a server job; toggling UI reactively as a flag
flips is a client job.

## The evaluation model

- **No network on read (client).** `useFlag` / `<FeatureFlag>` evaluate against
  an in-memory rule cache; there's no request per flag check.
- **Live rule updates** arrive over the realtime channel and update values in
  place — no refresh, no flicker. So flipping a flag, ramping a rollout, or
  hitting a kill switch is an admin action; your deployed code never changes.
- **Server pull-cache.** Server-side evaluation reads flag rules through a
  short-lived pull cache (default 30s TTL) and evaluates locally per request.
  Expect up to one TTL window of delay after toggling a flag before
  server-rendered output changes.
- **Telemetry** (which flags evaluated to what) is batched and reported in the
  background, off the render path.

## It stays up through outages

When the live channel drops, flags **freeze on their last-known values** and
refetch on reconnect, so your app keeps working through Bridge outages.

```tsx
'use client';
import { useRealtimeStatus } from '@nebulr-group/bridge-nextjs/client';
// ConnectionState: 'connecting' | 'open' | 'closed' …
const status = useRealtimeStatus();
```

## Flags work standalone

An `appId` is all the configuration flags need — you don't need Bridge auth or
billing. When those *are* enabled, they become automatic context sources you can
target on (see [Target by plan or role](/feature-flags/targeting/by-plan-or-role/)).

Next: [Get started](/feature-flags/get-started/).
