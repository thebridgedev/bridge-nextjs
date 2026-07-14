# Use flags in your logic

`useFlag` returns a plain reactive value — it isn't tied to markup. You'll often
use it to decide *what to render* (see [Show or hide UI](/feature-flags/using/show-hide-ui/)
for that, using the `<FeatureFlag>` component), but it's just as much for
deciding *what to do*: which function handles something, what limit to enforce,
which calculation to run. This page covers the `useFlag` API itself, then the
server-side equivalent for logic that runs before the browser.

## useFlag — reactive flag values (client)

```tsx
'use client';
import { useFlag } from '@nebulr-group/bridge-nextjs/client';

export function Banner() {
  const { value } = useFlag('show_banner', false);
  return value ? <div className="banner">New stuff!</div> : null;
}
```

`useFlag(key, defaultValue, context?)` returns `{ value, passed }`:

| Field | Description |
|-------|-------------|
| `value` | The evaluated flag value, typed from your default (`boolean` \| `string` \| `number` \| JSON object) |
| `passed` | Whether a rule branch matched |

The hook is **reactive**: when an admin changes the flag (or a live rule update
arrives), the component re-renders with the new `value`. The default is
mandatory — it's what your app gets when the flag isn't configured or Bridge is
unreachable. A flag call can never break your app.

`useFlag` is a React hook, so it only runs inside Client Components
(`'use client'`) and other hooks.

## Branching plain logic, not markup

The same `useFlag` value works in an event handler or a helper called from your
component just as well as in JSX — nothing renders, it just changes which code
path runs:

```tsx
'use client';
import { useFlag } from '@nebulr-group/bridge-nextjs/client';

export function useCheckout() {
  const useV2Pricing = useFlag('pricing_engine_v2', false);
  const maxUploads = useFlag('max_uploads', 10);

  function calculateTotal(cart: CartItem[]): number {
    // Route to one implementation or the other — no UI involved.
    return useV2Pricing.value ? calculateTotalV2(cart) : calculateTotalV1(cart);
  }

  function canUploadMore(currentCount: number): boolean {
    // Gate an action with a value an admin can tune without a deploy.
    return currentCount < maxUploads.value;
  }

  return { calculateTotal, canUploadMore };
}
```

An admin ramping `pricing_engine_v2` from 10% to 100%, or raising `max_uploads`
from 10 to 25, takes effect immediately, with no code change on your side.

## flagStore — subscribe outside React

For code that runs outside a component or hook (a plain module, a test), use
`flagStore` — it exposes a `subscribe` contract that fires immediately and again
on every live change:

```ts
import { flagStore } from '@nebulr-group/bridge-nextjs/client';

const banner = flagStore('show_banner', false);
const unsubscribe = banner.subscribe(({ value, passed }) => {
  // re-runs on every live flag change
});
```

## In server logic

`useFlag` is client-only. When the decision has to be made on the server — a
Server Component computing which variant to render, or a route handler picking a
code path — evaluate the flag there instead:

- For rendering, gate with `<ServerFeatureFlag>` (see [Show or hide UI](/feature-flags/using/show-hide-ui/)).
- For a route handler, wrap it with `requireFeatureFlagForRoute` (see [Use flags
  on your backend](/feature-flags/using/backend/)), which runs your handler only
  when the flag passes.

Server evaluation reflects flag changes within one pull-cache TTL window
(default 30s); client evals update instantly over the live channel.

## Multi-type values

One API for boolean, string, number, and JSON flags — the type is inferred from
the default:

```ts
const isDark = useFlag('dark_mode', false);
const cta    = useFlag('checkout_text', 'Submit');
const limit  = useFlag('max_uploads', 10);
const cfg    = useFlag('rate_limit', { window: 60, max: 100 });
```

A type mismatch (admin stored a different type than your default suggests)
returns the default and logs a warning.
