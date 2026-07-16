# Show or hide UI

The most common thing to do with a flag is decide whether a piece of UI renders at all. The `<FeatureFlag>` component does that declaratively, with optional fallback content for the off case. The render props receive the evaluated value:

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
```

> **Framework note:** React reserves the prop name `key` for reconciliation, so the flag key is passed as `flagKey`, not `key`.

## Sending context

`<FeatureFlag>` takes the same per-call eval context (the identity and attributes a flag rule evaluates against) as `useFlag`'s third argument. Use it when the rule targets an app-specific attribute Bridge doesn't already know (see [Send context from your code](/feature-flags/targeting/send-context/)):

```tsx
<FeatureFlag
  flagKey="new_dashboard"
  defaultValue={false}
  context={{ attributes: { project_count: projects.length } }}
>
  <NewDashboard />
</FeatureFlag>
```

Since `context` is a plain prop, it's reactive for free: React re-evaluates the object expression (and re-renders the flag) whenever `projects.length` changes.

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `flagKey` | `string` | **(required)** | The flag key |
| `defaultValue` | `T` | **(required)** | Safe value; also sets the flag's inferred type |
| `context` | `Partial<EvalContext>` | (none) | Per-call eval context (attributes win on collision) |
| `children` | node \| `(value) => node` | (none) | Rendered when the flag passes; receives the value |
| `fallback` | node \| `(value) => node` | (none) | Rendered when it doesn't; receives the value |

> **Framework note:** In Server Components, use `<ServerFeatureFlag>` from `@nebulr-group/bridge-nextjs/server`. It evaluates the same rules server-side against the request's token claims, takes `flagName`, `fallback`, `negate`, and `redirectTo` props, and reflects flag changes within one pull-cache TTL window (default 30s).
