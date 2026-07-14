# Show or hide UI

Gate what renders behind a flag. Next.js gives you two components — one for
Client Components, one for Server Components — evaluating the same rules from
Control Center.

## Client: `<FeatureFlag>`

Declarative gating in a Client Component, with optional fallback content.
`children` and `fallback` may each be a node or a render-prop that receives the
evaluated value:

```tsx
'use client';
import { FeatureFlag } from '@nebulr-group/bridge-nextjs/client';

<FeatureFlag flagKey="new_dashboard" defaultValue={false}>
  <NewDashboard />
</FeatureFlag>

// With fallback for the non-matching case:
<FeatureFlag
  flagKey="premium_feature"
  defaultValue={false}
  fallback={<button disabled title="Upgrade to unlock">Premium (locked)</button>}
>
  <button>Use premium feature</button>
</FeatureFlag>

// Render-prop form — receives the Bridge-decided value (useful for non-boolean flags):
<FeatureFlag flagKey="ui_theme" defaultValue="light">
  {(value) => <App theme={value} />}
</FeatureFlag>
```

`children` renders when the rule passes; `fallback` renders when the flag is off
or no rule matched. Because `<FeatureFlag>` is backed by the reactive `useFlag`
hook, it re-renders live when an admin flips the flag.

> **Tip:** React reserves the prop name `key` for reconciliation, so the flag
> key is passed as `flagKey`, not `key`. A prop literally named `key` never
> reaches the component.

### Sending context

`<FeatureFlag>` takes the same per-call context as `useFlag`'s third argument —
use it when the rule targets an app-specific attribute Bridge doesn't already
know (see [Send context from your code](/feature-flags/targeting/send-context/)):

```tsx
<FeatureFlag
  flagKey="new_dashboard"
  defaultValue={false}
  context={{ attributes: { project_count: projects.length } }}
>
  <NewDashboard />
</FeatureFlag>
```

`context` is a plain prop, so it's reactive for free — React re-evaluates the
flag whenever `projects.length` changes.

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `flagKey` | `string` | **(required)** | The flag key (`key` is reserved by React) |
| `defaultValue` | `T` | **(required)** | Safe value; also sets the flag's inferred type |
| `context` | `Partial<EvalContext>` | — | Per-call eval context (attributes win on collision) |
| `children` | node \| `(value) => node` | — | Rendered when the flag passes |
| `fallback` | node \| `(value) => node` | — | Rendered when it doesn't |

## Server: `<ServerFeatureFlag>`

For SSR-safe conditional rendering in a Server Component. It evaluates in
backend mode against the request's token claims (read from cookies via
`next/headers`), so the decision is made before the page is sent — no flash of
gated content on the client:

```tsx
// app/dashboard/page.tsx
import { ServerFeatureFlag } from '@nebulr-group/bridge-nextjs/server';

export default function Page() {
  return (
    <ServerFeatureFlag flagName="beta_dashboard" fallback={<StableDashboard />}>
      <BetaDashboard />
    </ServerFeatureFlag>
  );
}
```

It also supports `negate` and `redirectTo` for access control — redirect away
from the page instead of rendering a fallback:

```tsx
<ServerFeatureFlag flagName="maintenance_mode" negate redirectTo="/">
  <NormalContent />
</ServerFeatureFlag>
```

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `flagName` | `string` | **(required)** | The flag key |
| `children` | `ReactNode` | **(required)** | Rendered when the flag passes |
| `fallback` | `ReactNode` | — | Rendered when the flag is off / no rule matched |
| `negate` | `boolean` | `false` | Reverse the condition (render when the flag is *off*) |
| `redirectTo` | `string` | — | Redirect here instead of rendering the fallback |

> **Tip:** The server component uses `flagName`; the client component uses
> `flagKey`. Both point at the same flag key in Control Center.

## Which one?

- Reactive UI that flips live as an admin toggles a flag → client
  `<FeatureFlag>`.
- Content that must be decided before it reaches the browser (no flash, works
  without JS) → server `<ServerFeatureFlag>`.

Server-rendered output reflects flag changes within one pull-cache TTL window
(default 30s); the client surface updates instantly over the live channel.
