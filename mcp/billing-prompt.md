# Bridge Next.js — Billing

You are wiring **billing UI** into a Next.js 15+ App Router application that uses The Bridge with **`@nebulr-group/bridge-nextjs`**. Plans and Stripe are configured elsewhere — this guide covers the frontend only: the subscription page, lifecycle notices, the plan-selection paywall, quota/entitlement UI, and the billing portal. The SDK renders plans directly inside the app — there is **no handover redirect** to a separate plan-selection portal.

> `<BridgeProvider>` (in your root layout) auto-bootstraps the billing surface — it reads `NEXT_PUBLIC_BRIDGE_APP_ID`, connects the live channel, and wires the reactive billing stores. The drop-in components below need no extra setup beyond being rendered inside the provider.

`bridge guide mechanisms` is the one-page model this guide builds on: count usage once where the action happens, a POST increments the limit, counter vs gauge, and the three UI levels.

## The one rule for app code

**Every gate in app code is a flag.** A link, a page, a button, an endpoint: if some people get it and others do not, the code asks a flag, and the flag's rule says why: a privilege (`privileges contains "USER_WRITE"`), a plan feature (`bridge:billing.entitlement.analytics eq true`) or a rollout. App code never reads a role, a privilege list, the plan or a plan feature to decide what someone may see or do.

Two things are not gates and are not flags: **numbers** are plan limits (`<QuotaGate>` in the browser, `@RequireQuota` on the backend), and **permission on one specific record** stays in app code ("only the author edits their post").

Before calling the work done, run `npx @nebulr-group/bridge-cli check gates` in the project. It lists every direct role, privilege, plan or plan-feature check with the flag to use instead. Fix each one.

In Next.js: a piece of UI is `<FeatureFlag flagKey="…">` in a client component (`<ServerFeatureFlag flagName="…">` in a server component); a page is a `featureFlag` rule on `withBridgeAuth` in `middleware.ts` (`{ match: '/admin', featureFlag: 'admin-area' }`), or, when sign-in happens in the browser (SDK auth), `<FeatureFlag>` around the page's content; a nav link is the same `<FeatureFlag>` around the link.

## Decide first — which billing surface do you need?

Plans, prices, quotas and Stripe are configured in the Bridge admin, not in code. What you choose here is which drop-in to mount. Every one of them is reactive and needs nothing beyond being rendered inside `<BridgeProvider>`.

| You need | Mount | Notes |
|---|---|---|
| The subscription page, the paywall, and the checkout return pages | `app/subscription/[[...bridge]]/page.tsx` rendering `<BridgeBillingRoutes />` | ONE file. Serves `/subscription`, `/subscription/plan`, `/subscription/success`, `/subscription/error`, the defaults every redirect and Upgrade button point at. A completed checkout or Free pick lands on `/subscription` with a confirmation banner |
| Land somewhere else after checkout (`/dashboard`) | `billing: { successRoute: '/dashboard' }` + `<BridgeCheckoutNotice />` on that page or in the layout | Only if the developer asks. The banner shows once, right after a checkout; `useCheckoutResult()` for custom copy. Never build a confirmation page by hand |
| A signed-in tenant with no plan must pick one | Nothing more | The paywall redirect to `/subscription/plan` is on by default for an app with plans |
| An onboarding page at another address (`/welcome`) | `<BridgePaywallPage />` there + `billing: { paywallRoute: '/welcome' }` | Only if the developer asks for one — never create it unasked |
| Current plan + status badge anywhere | `<BridgeSubscriptionStatus />` | No props required |
| Lifecycle warnings — past due, trial ending, locked | `<BridgeBillingNotice />` | `mode="hard"` turns it into a blocking lockscreen when the workspace is locked |
| Plan limits | Nothing (level 0), `<QuotaGate metric>` (level 1), `useQuota(metric)` (level 2) | A backend `402 QUOTA_EXCEEDED` opens the upgrade dialog on its own |
| A feature only some plans include | `<FeatureFlag flagKey="…" defaultValue={false} upgrade>` with a flag ruled `bridge:billing.entitlement.<key> eq true` | Never `<Entitled to>` / `useEntitlements()` unless the developer asks for no flag |
| Let users manage their payment method or cancel | `<BillingPortalButton />` | Already on `/subscription` |

> **Never hardcode a billing-portal or Stripe URL.** `getBillingPortalUrl()` mints a portal session for the signed-in tenant; a pasted URL either expires or points at whichever workspace it was minted for. This has shipped as a bug before.

Everything above is client-side, imported from `@nebulr-group/bridge-nextjs/client`. Page files that only render a Bridge component need no `'use client'`.

**The billing screens stay current on their own.** The plan list, the current plan and the status badge are re-read when the sign-in is renewed, when a live billing event arrives (a plan change, a subscription or payment event), and when the tab regains focus more than 30 seconds after the last read. A plan created or changed in Bridge appears without a reload. Do not add polling, a refresh button or a `router.refresh()` for this.

## Configuring plans, prices, limits and features

These are configured from the Bridge **MCP tools** or the **`bridge` CLI**. Same operations, same API:

| Operation | MCP | CLI |
|---|---|---|
| List plans (with prices + quotas) | `list_plans` | `bridge plan list` / `bridge plan get <key>` |
| Create a plan | `create_plan` — `key`, `name`, `description?`, `trial?`, `trialDays?` | `bridge plan create --key … --name …` |
| Edit a plan | `update_plan` — `key`, `name?`, `description?` | `bridge plan update --key … --name …` |
| Add/replace a price | `set_plan_price` — `key`, `amount`, `interval`, `currency?` | `bridge plan price set <key> --amount … --interval …` |
| Remove a price | `remove_plan_price` — `key`, `interval`, `currency?` | `bridge plan price rm <key> --interval …` |
| Add/replace a limit (quota) | `set_plan_quota` — `key`, `metric`, `limit`, `policy`, `kind?`, `priceAmount?`, `priceCurrency?` | `bridge plan quota set <key> --metric … --limit … --policy … [--kind gauge]` |
| Remove a limit | `remove_plan_quota` — `key`, `metric` | `bridge plan quota rm <key> --metric …` |
| Sell an on/off feature on a plan | `add_plan_feature` | `bridge plan feature add <key> <feature> --name "…"` |
| Stop selling it on a plan | `remove_plan_feature` | `bridge plan feature remove <key> <feature>` |
| Connect Stripe | `connect_stripe` (or `setup_payments`) | `bridge stripe connect --secret-key … --publishable-key …` |

Use whichever is already set up. **If the user asks for a specific surface, use that one** — both reach the same API. If neither is available, offer to install one; only fall back to the dashboard if they decline. Connecting Stripe needs the user's live Stripe secret key: ask for it, never invent one or reuse a key found in a file.

**Counter or gauge?** If deleting it frees room, it's a gauge and your app counts it; if it happened, it's a counter and Bridge counts it. Projects, seats and documents are gauges (`kind: "gauge"`, "8 of 10 projects", never reset); AI completions, exports and API calls are counters (the default, "40 of 100 this month", reset each period). Every gauge value comes from your app, except seats.

**Seats** are a plan limit the app names (`seats`), kind gauge, that Bridge counts from workspace membership, pending invites included: `bridge plan quota set <plan> --metric seats --limit N --policy hard --kind gauge --source membership` (MCP: `set_plan_quota` with `kind: "gauge"`, `source: "membership"`). There is no built-in `users` metric. Ask whether invites go through Bridge's built-in team page or the app's own invite handler. Built-in team page: `<TeamManagementPanel seatsMetric="seats" />`, and Invite stops at the limit. Own handler: `@RequireQuota('seats')` on it. Bridge's invite API does not refuse at the limit, so one of the two must be in place. Never gate seats with a flag or an entitlement: a seat count is a limit. See the team prompt.

## Prerequisites

- The integration prompt is complete (`<BridgeProvider>` in `app/layout.tsx`, `NEXT_PUBLIC_BRIDGE_APP_ID` set).
- The Bridge app has at least one plan. If a plan has a price, Stripe must be connected, or `<PlanSelector>` silently fails when a user picks a paid plan. Free-only setups can skip the Stripe check.
- For Stripe Checkout flows, install the optional peer:

```bash
npm install @stripe/stripe-js
```

(Not needed if all your plans are free.)

## Migration check

If the codebase still calls `planService.redirectToPlanSelection()`, remove it. The new SDK pattern replaces that handover redirect with `<PlanSelector />` mounted inline.

## Step 1 — Subscription pages (one file)

```tsx
// app/subscription/[[...bridge]]/page.tsx
import { BridgeBillingRoutes } from '@nebulr-group/bridge-nextjs/client';

export default function SubscriptionPage() {
  return <BridgeBillingRoutes />;
}
```

The double brackets make the catch-all optional so the bare `/subscription` matches. Do not also create `app/subscription/page.tsx` (Next.js refuses both). Do not create success/cancel/payment-error pages: the catch-all serves them.

**Where a checkout lands.** Stripe returns to `billing.successRoute`, which defaults to the subscription page; `<BridgeProvider>` confirms the checkout on that page load, and the page shows a "You're on Pro now" banner (`<BridgeCheckoutNotice>`). A Free pick lands the same way. If the developer wants users back in the app after paying, set `billing: { successRoute: '/dashboard' }` (their page) and render `<BridgeCheckoutNotice />` on that page or in the layout; it shows once, only right after a checkout. For custom copy, read `useCheckoutResult()` and call `clearCheckoutResult()` once shown. A failed payment lands on `/subscription/error`. The old confirmation page `/subscription/success` is still served for an app that points `successRoute` at it.

## Step 2 — Billing notice banner

Add `<BridgeBillingNotice />` to the root layout, inside `<BridgeProvider>`. It renders nothing when billing is healthy and shows the right message for payment failures, trial endings, dunning retries and cancellations. Its CTA goes to `billing.manageRoute` (default `/subscription`, the page Step 1 serves). Pass `mode="hard"` for a full-screen lockscreen when the workspace is billing-locked.

## Step 3 — Plan limits (optional)

Skip if the plans have no limits. Count usage once, where the action happens: if the click calls the app's backend, the backend counts it (bridge-nestjs `@RequireQuota`); the page only calls it with `bridgeFetch()` and writes no quota code. A `402 QUOTA_EXCEEDED` answer opens the upgrade dialog `<BridgeProvider>` mounts.

```tsx
'use client';
import { bridgeFetch, QuotaGate } from '@nebulr-group/bridge-nextjs/client';

<QuotaGate metric="tickets">
  <button onClick={() => bridgeFetch('/api/tickets', { method: 'POST' })}>New ticket</button>
</QuotaGate>
```

`<QuotaGate>` (level 1) disables the button at a known hard cap; `useQuota('tickets')` (level 2) gives `{ loading, unlimited, used, limit, remaining }` for custom UI, with numbers `null` until Bridge answers. Do not write a quota `if`, a "limit reached" toast or a `/quota` endpoint.

When the click does **not** call your server (a local-first app, an action that stays in the browser), the page counts it instead: `bridge.usage.report('exports')` for a counter (fire-and-forget), `await bridge.usage.set('projects', projects.length)` for a gauge. `<QuotaGate>` still stops it at the limit.

**Never count one metric on both sides** — the same action is then counted twice. In development the plugin warns once in the browser console when your backend and the page count the same metric (bridge-nestjs marks a counting response with `X-Bridge-Usage-Counted` outside production; nothing is sent or printed in production). If you see that warning, keep the backend count and remove the `bridge.usage` call.

### Plan features — a flag ruled on the plan's list

An on/off feature some plans sell (analytics, SSO) is two pieces: the plan lists it, and a flag reads that list. The flag's rule never names plans, so when Pro gains or loses the feature you change the plan and no rule has to follow.

1. Put the feature on each plan that sells it: `bridge plan feature add pro analytics --name "Analytics"` (MCP: `add_plan_feature`).
2. Create the flag with the rule `bridge:billing.entitlement.analytics eq true` (MCP: `create_feature_flag`; CLI: `bridge flag create`, see the Feature Flags prompt).
3. Gate on the flag:

```tsx
'use client';
import { FeatureFlag } from '@nebulr-group/bridge-nextjs/client';

<FeatureFlag flagKey="analytics" defaultValue={false} upgrade>
  <AnalyticsPanel />
</FeatureFlag>
```

`upgrade` shows an "Upgrade to use this" button in its place when the plan is why it is off; clicking it opens the upgrade dialog. For your own prompt, pass a `fallback={(value, { reason, openUpgrade }) => …}` render-prop: `reason` is `'plan'` when an upgrade alone would turn it on. On a signed-in page the gate waits for the plan's features (each startup read capped at 1.5 s) before it decides, and renders its `loading` prop (nothing by default) meanwhile, so a paying user never sees the upgrade prompt flash. When the plan changes, the gate re-checks on its own.

### Exceptions — checking the plan directly

`<Entitled to="analytics">` and `useEntitlements().can('analytics')` read the plan's list with no flag in between. Use them only when the developer explicitly asks for no flag; in development they log a one-time note pointing at the flag rule.

## Reading subscription state

To show the plan, render `<BridgeSubscriptionStatus />`. For your own markup, read the live snapshot slice:

```tsx
'use client';
import { bridge, useBridgeReadable } from '@nebulr-group/bridge-nextjs/client';

export function CurrentPlan() {
  const subscription = useBridgeReadable(bridge.tenant.subscription);
  return subscription ? <p>Current plan: {subscription.plan.name}</p> : null;
}
```

This is for display. To decide what someone may see or do, ask a flag (the rule above), never the plan.

`useSubscription()` is the plan list + status `<PlanSelector>` reads; call `loadSubscription()` once to fill it, and the refresh rule keeps it current. For canonical live billing state (plan + lifecycle status), `useBridgeBilling().subscription.snapshot()` / `.subscribe(fn)`. Report usage from the browser with `bridge.usage.report(metric)` (fire-and-forget — do not `await`). Register side-effect handlers with `useBridgeBilling().handle({ 'subscription.plan_changed': fn, ... })`.

Auth-core methods used internally by `<PlanSelector>`: `selectFreePlan(planKey)`, `changePlan(planKey, priceOffer)`, `startCheckout(planKey, priceOffer, { successUrl, cancelUrl })`, `getSubscriptionStatus()`, `getPlans()` (the last two via `loadSubscription()`).

## Billing checklist

- [ ] `@stripe/stripe-js` installed (only required for paid plans with Stripe).
- [ ] `app/subscription/[[...bridge]]/page.tsx` renders `<BridgeBillingRoutes />`; no other `app/subscription/*` pages unless the developer asked to take one over.
- [ ] `<BridgeBillingNotice />` added to the root layout (inside `<BridgeProvider>`).
- [ ] Backend calls go through `bridgeFetch()`; no hand-written quota checks in the page.
- [ ] Usage counted once, where the action happens: the backend (`@RequireQuota`) when the click calls your server, `bridge.usage` when it does not, never both.
- [ ] Plan features: on the plan (`bridge plan feature add`) and gated by a flag ruled `bridge:billing.entitlement.<key> eq true`, never a check of the plan in the page.
- [ ] `npx @nebulr-group/bridge-cli check gates` reports nothing.
- [ ] **No legacy `planService.redirectToPlanSelection()` calls remain.**

## Verify

1. Sign in.
2. Navigate to `/subscription` — plan cards render with correct prices.
3. Select a free plan: you are back on `/subscription` with a "You're on … now" banner and the new plan marked as yours.
4. Select a paid plan: Stripe Checkout launches. Complete the payment: you are back on `/subscription` with the new plan showing and a "You're on … now" banner.
5. Cancel payment — returned to `/subscription`.
6. Paywall: sign in as a new tenant with no plan — any page redirects to `/subscription/plan` until a plan is chosen.
7. Run `npm run build` — no TypeScript or import errors.

## Going further

This prompt covers the UI layer. For the runtime model behind it — how the live billing surface stays current, the full snapshot/quota field shapes, composing your own reactive hooks, reporting usage durably, entitlement-vs-flag gating, and gate-state handling — see the learning docs:

- **How billing works:** `learning/billing/how-it-works/how-it-works.md`
- **Lock features to a plan:** `learning/billing/limits/lock-features.md`
- **The model in one page:** `learning/mechanisms.md`
- **Live updates & the Bridge surface:** `learning/live-updates/live-updates.md` (snapshots vs events, connection/reconnection behavior, why live updates can be off)
