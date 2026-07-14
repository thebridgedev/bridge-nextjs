# Send context from your code

## When to send your own context

Rules target on data, and Bridge already supplies some of that data for free — if
the account is signed in, `user.role` and `tenant.plan` are already in every
evaluation with zero code on your part (see [Target by plan or role](/feature-flags/targeting/by-plan-or-role/)).

Send your own context when the thing you want to target on is something only
*your app* knows — a business fact that lives in your own data, not in Bridge. For
example: "only show the new dashboard to users with more than 3 projects." Bridge
has no idea how many projects a user has, so you tell it:

```tsx
const dashboard = useFlag('new_dashboard', false, {
  attributes: { project_count: projects.length },
});
```

With `project_count` flowing in, the admin can add a rule in Control Center —
`project_count greater than 3` — without you touching this code again. That's the
pattern: send whatever app-specific fact the targeting decision depends on, once,
and every future rule change is a Control Center edit, not a redeploy.

There are two ways to send it, depending on how widely it applies.

## Per-call context

The optional third argument supplies attributes for **one call site** — use this
for a value that's only meaningful to that particular flag check, like
`cart_size` on a checkout flag. Per-call attributes win over everything else on
key collision:

```tsx
const checkout = useFlag('new_checkout', false, {
  attributes: { cart_size: cart.items.length },
});
```

`<FeatureFlag>` takes the same context as a `context` prop instead of a third
argument — see [Show or hide UI](/feature-flags/using/show-hide-ui/#sending-context)
for the component form. Both are plain objects: React re-evaluates the hook (and
re-renders the component) on every render, so the context stays current without a
getter function — unlike bridge-svelte, which needs `() => ({ ... })` to stay
reactive outside a template.

## App-wide attributes (`bridge.attributes`)

Use this instead when a value should be available to **every** flag evaluation
across your app, not just one call site — so you don't have to remember to pass it
into every `useFlag` call that might eventually want it. A good example is
something set once near login or app start, like a beta cohort, that several
unrelated flags might target on over time:

```tsx
'use client';
import { bridge } from '@nebulr-group/bridge-nextjs/client';

bridge.attributes.set('beta_cohort', true);                    // static value
bridge.attributes.bind('cart_size', () => cart.items.length);  // re-read on every eval
bridge.attributes.bindMany(() => ({ theme, locale }));         // bulk getter
```

Precedence on key collision: per-call context > `bridge.attributes` >
Bridge-managed providers. The `bridge:` namespace is reserved — writes to it are
rejected with a console warning.

> **Tip:** `bridge.attributes` writes are a client concern — set them in a Client
> Component (`'use client'`). Server-side evaluation
> (`<ServerFeatureFlag>`, middleware) builds its context from the request's token
> claims; pass server-specific per-call attributes through the flag's own API
> where the SDK supports it, and keep dev-supplied `bridge.attributes` on the
> browser side.
