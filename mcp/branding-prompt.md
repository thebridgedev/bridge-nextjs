# Bridge Next.js — Branding

You are applying a workspace's branding (logo, name, colours) inside a Next.js 15+ App Router application that uses The Bridge with **`@nebulr-group/bridge-nextjs`**.

## The one rule for app code

**Every gate in app code is a flag.** A link, a page, a button, an endpoint: if some people get it and others do not, the code asks a flag, and the flag's rule says why: a privilege (`privileges contains "USER_WRITE"`), a plan feature (`bridge:billing.entitlement.analytics eq true`) or a rollout. App code never reads a role, a privilege list, the plan or a plan feature to decide what someone may see or do.

Two things are not gates and are not flags: **numbers** are plan limits (`<QuotaGate>` in the browser, `@RequireQuota` on the backend), and **permission on one specific record** stays in app code ("only the author edits their post").

Before calling the work done, run `npx @nebulr-group/bridge-cli check gates` in the project. It lists every direct role, privilege, plan or plan-feature check with the flag to use instead. Fix each one.

In Next.js: a piece of UI is `<FeatureFlag flagKey="…">` in a client component (`<ServerFeatureFlag flagName="…">` in a server component); a page is a `featureFlag` rule on `withBridgeAuth` in `middleware.ts` (`{ match: '/admin', featureFlag: 'admin-area' }`), or, when sign-in happens in the browser (SDK auth), `<FeatureFlag>` around the page's content; a nav link is the same `<FeatureFlag>` around the link.

Branding is not a gate: a workspace's own logo or colour is shown to everyone in it. A branding feature only some plans sell ("custom logo on Pro") is a gate, so it is a flag ruled on the plan feature, like any other.

## Decide first — branding or theming?

These are different things and mixing them up wastes a lot of time.

| You want | This is | Where it lives |
|---|---|---|
| The workspace's logo, name and colours in **your** UI | **Branding** | Live data on `bridge.app.branding` — this guide |
| Restyle the Bridge **components** (login form, plan selector) | **Theming** | The `--bridge-*` CSS tokens — see *Theming* below |
| Change the logo on Bridge's **hosted** login page and emails | **Branding config** | `update_branding` over MCP, or `bridge branding …` on the CLI |

Branding is **workspace-supplied live data you read and apply yourself**. Bridge does not reach into your components and restyle them — if you want the header to use the brand colour, you write that binding.

## Where it comes from

The branding snapshot arrives on the realtime `session.snapshot` and is replaced wholesale when a new one is pushed. An admin changing the logo is reflected **within seconds, with no reload** — which is the reason to read this reactively rather than fetching once at startup.

```ts
interface BrandingSnapshot {
  logo: string;
  name: string;
  primaryButtonBgColor?: string;
  textColor?: string;
  bgColor?: string;
  fontFamily?: string;
}
```

The type is exported as `BrandingSnapshot` from `@nebulr-group/bridge-nextjs/client`; do not copy it into your codebase.

Everything except `logo` and `name` is optional, so **always supply a fallback**. A workspace that has set no colours yields `undefined`, and interpolating that into a style produces an invalid value rather than a default.

The value is `null` until the first snapshot lands, and always `null` in the server render. Guard for it — rendering `branding.logo` off a null is the most common crash here.

## Reading it

`bridge.app.branding` is a Bridge readable; subscribe to it with the `useBridgeReadable` hook in a client component:

```tsx
'use client';
import { bridge, useBridgeReadable } from '@nebulr-group/bridge-nextjs/client';

export function Header() {
  const branding = useBridgeReadable(bridge.app.branding);
  if (!branding) return null; // null until the first snapshot lands

  return (
    <header
      style={{
        background: branding.bgColor ?? 'var(--surface)',
        color: branding.textColor ?? 'inherit',
      }}
    >
      <img src={branding.logo} alt={branding.name} height={28} />
      <span>{branding.name}</span>
    </header>
  );
}
```

Branding is client-side: the live channel runs in the browser, so a server component cannot read it. Put the branded part in a client component and render it from your layout.

## Setting the branding

Not app code. Over MCP: `update_branding`. On the CLI: `bridge branding get` / `bridge branding update`. Or the dashboard. All three write the same record, which then pushes to every connected client.

> `update_branding` is a write tool with real user-visible effect. Confirm with the user before changing a logo or colour — this is the sort of change somebody notices immediately and did not ask for.

## Theming the Bridge components

Theming is plain CSS against a fixed set of tokens: the `--bridge-*` variables are the contract, and each has a default. Import the stylesheet once in `app/layout.tsx` (`import '@nebulr-group/bridge-nextjs/styles';`), then set the tokens on `:root`, or on a wrapper to theme one area:

```css
:root {
  --bridge-primary: #7c3aed;
  --bridge-border-radius: 10px;
}
```

The full list with defaults is in `bridge guide mechanisms` (section 6) and `learning/theming/theming.md`; hover, focus and tint follow `--bridge-primary` unless set. Besides colours there are weight and shadow tokens (`--bridge-font-weight-heading` / `-button` / `-label`, `--bridge-button-shadow`, `--bridge-card-shadow`) for an app with its own type style. Don't set what the app already gives: Bridge inherits the font and text colour, and its text sizes follow the app's `<body>` (`--bridge-font-size` only to make them differ).

All Bridge styles sit in a CSS cascade layer named `bridge`, so the app's `:root` wins whatever order the stylesheets load in, and any plain CSS the app writes outside a layer overrides Bridge's classes and data attributes without `!important` (`[data-bridge-plan-card] { border-width: 2px; }`). Tailwind utilities are themselves in a layer, so on Bridge's elements they lose where Bridge sets the same property: use plain CSS there, or Tailwind's important modifier. With Tailwind, keep the styles import and map the tokens to the theme (`--bridge-primary: var(--color-brand-600)`); drop the `@nebulr-group/bridge-nextjs/styles` import to style the components from scratch. To bind a token to the workspace's live branding, set it from the readable:

```tsx
<div style={{ ['--bridge-primary' as string]: branding?.primaryButtonBgColor ?? '#4f46e5' }}>
  {children}
</div>
```

Beyond tokens, `<BridgeAuthRoutes>` takes `frame` and `heading` render functions, and any one page can be replaced by creating its route file — the rungs in `bridge guide mechanisms`.

## Common mistakes

- **Fetching branding from your own API.** It is already on the live channel; a copy in your backend is stale the moment an admin edits it, and you lose the push.
- **Reading it once at startup.** It updates live; a one-shot read silently reverts the feature to "needs a reload".
- **Reading it in a server component.** It is `null` there; the snapshot only reaches the browser.
- **Assuming the colours exist.** They are optional. Always pass a fallback.
- **Theming by reaching into component markup.** Start with the `--bridge-*` tokens; for anything they don't cover, write plain CSS against Bridge's classes and the `[data-bridge-*]` attributes (the theming docs list them). Branding is the workspace's data, not a way to restyle the components.
- **Confusing it with the hosted login page.** Bridge brands its own pages from the same record; nothing you do in app code affects those.

## Related guides

- `integration-prompt.md` — mounting the Bridge runtime, which is what delivers the snapshot
- `team-prompt.md` — the workspace whose branding this is
- `learning/branding/branding.md` and `learning/theming/theming.md` — the learning docs
