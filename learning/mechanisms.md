# How Bridge works

The rules every Bridge guide builds on, on one page: what the smallest integration is, where a plan limit is counted, the three ways to show a limit in the UI, and the levels of customising Bridge's pages. Coding agents get the same page from `bridge guide mechanisms`.

The frontend examples are Next.js App Router (`@nebulr-group/bridge-nextjs`); the backend examples are NestJS (`@nebulr-group/bridge-nestjs`).

In short: every gate in app code is a flag, and its rule says why (a privilege, a plan feature, a rollout).

## The whole integration

What a developer's repo holds once Bridge is in. Nothing else is required; every other page Bridge needs, it serves.

**Frontend (Next.js) — three files, plus one line of `.env`:**

```env
# .env.local
NEXT_PUBLIC_BRIDGE_APP_ID=your-app-id
```

```tsx
// app/layout.tsx — stays a Server Component
import { BridgeProvider } from '@nebulr-group/bridge-nextjs/client';
import '@nebulr-group/bridge-nextjs/styles';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <BridgeProvider config={{ loginRoute: '/auth/login' }}>{children}</BridgeProvider>
      </body>
    </html>
  );
}
```

```tsx
// app/auth/[...bridge]/page.tsx — every sign-in page
import { BridgeAuthRoutes } from '@nebulr-group/bridge-nextjs/client';
export default function AuthPage() {
  return <BridgeAuthRoutes />;
}
```

With plans, one more file serves the subscription page, the paywall and both checkout return pages. The double brackets make the catch-all optional, so the bare `/subscription` matches too:

```tsx
// app/subscription/[[...bridge]]/page.tsx
import { BridgeBillingRoutes } from '@nebulr-group/bridge-nextjs/client';
export default function SubscriptionPage() {
  return <BridgeBillingRoutes />;
}
```

No client "Providers" wrapper is needed: the config is plain data, so the Server Component layout passes it straight to `<BridgeProvider>`.

**Backend (NestJS)** — see the bridge-nestjs docs: `BridgeModule.forRoot({ guard: { global: true } })` and `@RequireQuota('exports')` on the handler that does the work.

**Settings are read for you.** Each field resolves as *explicit option > environment > default*; an empty value counts as unset. The provider, `withBridgeAuth` and every server helper resolve through the same `createBridgeConfig()`, so they always agree.

| Variable | When to set it |
|---|---|
| `NEXT_PUBLIC_BRIDGE_APP_ID` | Always. Missing, Bridge does not start and names the variable |
| `NEXT_PUBLIC_BRIDGE_API_BASE_URL` | Only for a non-production app (stage, local, self-hosted). Unset means production |
| `NEXT_PUBLIC_BRIDGE_HOSTED_URL` | Only for a local or self-hosted Bridge. On Bridge's own domains it follows the API address (`api-stage` → `auth-stage`) |
| `NEXT_PUBLIC_BRIDGE_DEBUG` | `true` for console logging |

## 1. Decide once, where the action happens

Ask one question first: **does this action call your server?**

- **It calls your backend:** the backend handler counts it and refuses at the limit. The frontend shows the count and the upgrade dialog, and does not count the same metric again.
- **It happens in the browser** and never reaches a server of yours: the browser counts it (`getBridgeAuth().usage.report('exports')` for a counter) and `<QuotaGate>` stops the button at the limit.

Never both for one metric: it would be counted twice.

## 2. A POST increments the limit

The backend decorator **is** the increment (bridge-nestjs `@RequireQuota`). At the plan's limit the request is refused with `402` and a body the frontend understands: `{ code: 'QUOTA_EXCEEDED', metric, used, limit, fix }`. Only a 2xx answer records a use.

## 3. Three ways to handle a limit in the UI

Pick the lowest level that does the job. Each is optional; level 0 is on without code.

| Level | What the page writes | What the user sees |
|---|---|---|
| **0 — nothing** | a button calling your API with `bridgeFetch()` | Your backend refuses at the cap (`402`), and `<BridgeProvider>` opens an **upgrade dialog** naming the metric, linking to the subscription page. A workspace member who cannot manage billing is told to ask the owner instead |
| **1 — one component** | `<QuotaGate metric="tickets">…</QuotaGate>` around the button; `<FeatureFlag flagKey="analytics" defaultValue={false} upgrade>…</FeatureFlag>` around a paid feature | The button is disabled at a known hard cap with an upgrade line beside it; the paid feature shows on a plan that includes it, and elsewhere an "Upgrade to use this" button that opens the dialog when clicked |
| **2 — your own UI** | `useQuota('tickets')`, and `<FeatureFlag flagKey="analytics">` around what the plan sells | Whatever you build from the live numbers |

```tsx
'use client';
import { bridgeFetch, FeatureFlag, QuotaGate, useQuota } from '@nebulr-group/bridge-nextjs/client';

export function Tickets() {
  const tickets = useQuota('tickets');
  return (
    <>
      {/* level 1 (and level 0: bridgeFetch) */}
      <QuotaGate metric="tickets">
        <button onClick={() => bridgeFetch('/api/tickets', { method: 'POST' })}>New ticket</button>
      </QuotaGate>

      {/* the flag's rule: bridge:billing.entitlement.analytics eq true */}
      <FeatureFlag flagKey="analytics" defaultValue={false} upgrade>
        <a href="/analytics">Analytics</a>
      </FeatureFlag>

      {/* level 2 */}
      {tickets.loading ? 'Loading…' : tickets.unlimited ? 'Unlimited tickets' : `${tickets.used} of ${tickets.limit} tickets`}
    </>
  );
}
```

- "Not loaded yet" is never "zero" and never "not allowed": `useQuota` numbers stay `null` while `loading`, and `<QuotaGate>` stays enabled while loading.
- No upgrade dialog opens by itself: it opens on a `402` from your backend (`QUOTA_EXCEEDED`, or `FEATURE_NOT_IN_PLAN` for a plan feature), or when someone clicks an upgrade prompt. A page that only renders a hidden feature opens nothing.
- A plain `fetch` to your own origin or to Bridge's API that answers `402 QUOTA_EXCEEDED` opens the dialog too. A backend on another origin called with plain `fetch` is listed in `billing.apiOrigins`. `billing: { upgradeDialog: false }` turns the dialog off (render your own from `useUpgradeRequest()`), `billing: { upgradeDialog: MyDialog }` replaces it — a component is a function, so pass that one from a Client Component.
- Do not write a quota `if`, a "limit reached" toast or a `/quota` endpoint of your own.

**A plan feature goes in the plan's features list**, and the flag that controls it is ruled `bridge:billing.entitlement.<feature> eq true`. On a route, put the flag on a `withBridgeAuth` rule: `{ match: '/analytics', featureFlag: 'analytics' }` (signed in, then flag; off → `403`). Next.js runs one middleware, so this — not a second `withFeatureFlags` middleware — is how sign-in and a flag combine.

## 4. Levels of customising Bridge's pages

The same ladder holds for the sign-in pages (`<BridgeAuthRoutes>`) and the subscription pages (`<BridgeBillingRoutes>`). Climb only as far as you need.

| Rung | What you do | What you own |
|---|---|---|
| **0 — nothing** | Bridge's pages render inside your own `app/layout.tsx` | Your navigation, header and shell already surround them |
| **1 — tokens** | Set `--bridge-*` CSS variables in your CSS | Colours, radius, spacing |
| **2 — frame and heading** | Pass the `frame(page, children)` and `heading(page)` render-props (functions, so the page file is `'use client'`) | Everything around the form on every page, and each page's heading |
| **3 — take over one page** | Create that page's own file, e.g. `app/auth/login/page.tsx` | That one page; Next.js prefers it over `[...bridge]`, every other page keeps working |
| **4 — headless** | Build your own UI on `getBridgeAuth()` | Everything |

```tsx
// rung 2: app/auth/[...bridge]/page.tsx
'use client';
import { BridgeAuthRoutes } from '@nebulr-group/bridge-nextjs/client';

export default function AuthPage() {
  return (
    <BridgeAuthRoutes
      frame={(page, children) => <main className="auth-card">{children}</main>}
      heading={(page) => <h1>{page === 'signup' ? 'Create your account' : 'Welcome back'}</h1>}
    />
  );
}
```

`heading` replaces only each page's main step; sub-steps such as "Reset your password" keep their own, so two headings never stack. A page you take over (rung 3) that has a token in its address reads it from `params`, which Next.js 15 passes as a Promise: `const { token } = use(params)`.

**The token contract (rung 1)** is the one bridge-svelte documents: `--bridge-primary`, `--bridge-primary-hover`, `--bridge-primary-fg`, `--bridge-bg`, `--bridge-foreground`, `--bridge-muted`, `--bridge-muted-bg`, `--bridge-border`, `--bridge-border-radius`, `--bridge-overlay`, the `--bridge-alert-{error,success,info,warning}-{bg,fg,border}` families, and the layout tokens `--bridge-auth-page-padding`, `--bridge-billing-page-width`, `--bridge-billing-page-padding`, `--bridge-paywall-bg`, `--bridge-paywall-panel-bg`. The defaults are declared on `:where(:root)`, which has zero specificity, so your `:root` wins whichever stylesheet loads first. See [theming](/theming/).

## 5. Pages Bridge serves, and the one it only offers

- **Sign-in:** `app/auth/[...bridge]/page.tsx` serves login, signup, the OAuth callback, set password (where signup verification and password-reset emails land), forgot password, magic link, passkey setup and workspace selection. Which methods appear comes from the app's settings at runtime. `loginRoute: '/auth/login'` is the switch to in-app sign-in; without it each page points at the hosted login. A hosted-login app whose `withBridgeAuth` middleware guards pages keeps `app/auth/oauth-callback/route.ts` (`createBridgeCallbackRoute`), which Next.js prefers over the catch-all and which stores the session in a cookie the middleware reads.
- **Subscription:** `app/subscription/[[...bridge]]/page.tsx` serves `/subscription`, the paywall `/subscription/plan`, and the checkout return pages `/subscription/success` and `/subscription/error`. Bridge's redirects and upgrade links point there by default.
- **The paywall** redirects a signed-in workspace with no plan to `/subscription/plan` — only when the app has plans and its `paymentsAutoRedirect` setting is on (the default). `billing: { paywallRoute: false }` turns it off.
- **A `/welcome` onboarding page is offered, never created unasked.** Only if the developer says yes, add a page rendering `<BridgePaywallPage />` and `billing: { paywallRoute: '/welcome' }`.
- Any other address under a catch-all gets the app's own not-found page.

## Exceptions

Checking a plan feature without a flag (`<Entitled to>` or `useEntitlements().can()` in the UI) exists for the rare case where the developer explicitly asks for no flag. It prints a one-time note in development.
