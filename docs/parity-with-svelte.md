# bridge-nextjs ↔ bridge-svelte parity

The Next.js column of the TBP-515 parity matrix. Rows are bridge-svelte 0.9.0's public surface (`bridge-svelte/src/lib/index.ts` on `main`); a cell says whether `@nebulr-group/bridge-nextjs` has it.

- **present** — shipped before this PR
- **added (TBP-742)** — added by the ten-line port (this PR)
- **added (TBP-946)** / **added (TBP-948)** — later parity ports (0.9.0 / 0.9.1)
- **different** — deliberately not the same shape, and why

Svelte stores become React hooks throughout (`$authState` → `useAuthState()`); that is the framework translation, not a gap, and is not repeated per row.

## Bootstrap and config

| bridge-svelte | bridge-nextjs | Status |
|---|---|---|
| `bridgeBootstrap(options)` in `+layout.ts` | `<BridgeProvider config>` in `app/layout.tsx` | different — Next.js has no layout `load`; the provider is the one bootstrap. The config is plain data, so the Server Component layout passes it directly |
| `<BridgeBootstrap>` | `<BridgeProvider>` | present |
| env reading (`VITE_BRIDGE_*`), *option > env > default* | `NEXT_PUBLIC_BRIDGE_*`, `createBridgeConfig()` | added (TBP-742) — before, env won over props |
| `hostedUrl` follows `apiBaseUrl` (`api-stage` → `auth-stage`) | same, `hostedUrlFor()` | added (TBP-742) |
| no app id → refuses, names the variable | `createBridgeConfig()` throws; the provider logs the same error and does not start | different — the provider must not crash a server render |
| `initBridge`, `getBridgeAuth`, `auth`, `waitForBridge`, `markReady`, `ensureAppConfig`, `loadSubscription` | same names | present |
| `useBridge()` / `setBridgeContext` (test override of the `bridge` surface) | `useBridge()` | different — no context override; tests use `_resetBridgeInstance()` |
| `bridge` surface (`app`, `tenant`, `user`, `attributes`, `events`) | same | present |
| `bridge.usage` (`report` / `set` / `getQueueStatus`) | same | added (TBP-742) |
| `logger`, `setLoggerDebug` | same | present |
| `realtimeStatus`, `realtimeStatusDetail`, `onBridgeRealtimeStatus`, `RealtimeDevBadge` | same (+ `useRealtimeStatus*` hooks) | present |

## Sign-in

| bridge-svelte | bridge-nextjs | Status |
|---|---|---|
| `<BridgeAuthRoutes>` + `auth/[...bridge]` | `<BridgeAuthRoutes>` + `app/auth/[...bridge]/page.tsx` | added (TBP-742) |
| `frame` / `heading` snippets | `frame` / `heading` render-props | added (TBP-742) — functions, so a page passing them is `'use client'` |
| unknown segment → app 404 | `notFound()` | added (TBP-742) |
| OAuth callback in the bootstrap load | `oauth-callback` page of the catch-all (browser exchange); `createBridgeCallbackRoute()` for cookie sessions | different — a hosted-login app guarded by `withBridgeAuth` keeps `app/auth/oauth-callback/route.ts`, which Next.js prefers over the catch-all, so the middleware can read the session cookie |
| `BRIDGE_AUTH_PAGES`, `parseBridgeAuthRoute` | same (accepts Next's array params) | added (TBP-742) |
| `LoginForm`, `SignupForm`, `ForgotPassword`, `MagicLink`, `MfaChallenge`, `MfaSetup`, `TenantSelector`, `WorkspaceSelector`, `SsoButton` | same | present |
| `headingSnippet` on every form | `headingSlot` on `LoginForm` (present) and `SignupForm`, `ForgotPassword`, `MagicLink`, `PasskeySetup` | added (TBP-742) |
| route guard (`rules` in `bridgeBootstrap`, `createRouteGuard`) | `withBridgeAuth` (server, cookie sessions), `<ProtectedRoute>` and `createRouteGuard` (client) | present — `RouteRule.featureFlag` on `withBridgeAuth` now documented as the way to combine sign-in and a flag |
| route guard opens the upgrade dialog on a plan-gated route | — | different — `withBridgeAuth` answers a flag denial with `403` (TBP-473) before any page renders; a page that wants the upgrade prompt gates with `<FeatureFlag upgrade>` |
| `readReturnTo`, `withReturnTo`, `sanitizeReturnTo` | same | present |
| i18n (`createTranslator`, `en`, `sv`, `LOCALES`, …) | same | present |

## Passkeys

| bridge-svelte | bridge-nextjs | Status |
|---|---|---|
| `PasskeyLogin`, `PasskeySetup`, `PasskeyRequestSetupLink` | same | present, **fixed (TBP-742)** — login called `authenticateWithPasskey()` with no browser response and setup called a `registerPasskeyWithToken()` auth-core lacks; neither could succeed. Both now run the WebAuthn ceremony |
| `@simplewebauthn/browser` a regular dependency (S3) | same | added (TBP-742) |
| `PasskeySetup` starts the ceremony on mount | starts on a click | different — deliberate (TBP-633): browsers block a WebAuthn prompt that no user gesture started |

## Billing

| bridge-svelte | bridge-nextjs | Status |
|---|---|---|
| `<BridgeBillingRoutes>` + `subscription/[...bridge]` | `<BridgeBillingRoutes>` + `app/subscription/[[...bridge]]/page.tsx` | added (TBP-742) — double brackets because Next's `[...x]` needs a segment and `/subscription` has none |
| `<BridgePaywallPage>`, `<BillingPortalButton>` | same | added (TBP-742) |
| billing route defaults (`/subscription`, `/subscription/plan`, `/subscription/error`), default paywall only for an app with plans, `paywallRoute: false` | same | added (TBP-742) — before: `/billing`, `/payment-error`, no default paywall |
| `BRIDGE_BILLING_PAGES`, `BRIDGE_BILLING_DEFAULTS`, `parseBridgeBillingRoute` | same | added (TBP-742) |
| `<PlanSelector>` `planCard` | same | present |
| `<PlanSelector>` `planDescription` / `planFooter` (S2) | render-props | added (TBP-742) |
| `<PlanSelector>` interval tabs, plan features list, change-plan confirm, retry on an empty plan list, a Free pick moves on | same | added (TBP-946) |
| `<BridgePaywall>`, `<BridgeBillingNotice>`, `<BridgeSubscriptionStatus>`, `<BridgeQuotaBanner>` | same | present |
| `subscriptionStore` + the 30-second billing refresh rule (TBP-762) | `useSubscription()` + `loadSubscription()`; `core/billing-store.ts` | added (TBP-948) — the plan list, current plan and billing state are re-read on a renewed sign-in, a live billing event, and tab focus after 30 s; screens read once on mount and never blank on a re-read |
| plan features, billing state and flag definitions read before the first render (TBP-810) | `core/startup-reads.ts`; `<FeatureFlag loading>`, `useFlag().loading` | added (TBP-948) — different shape: the App Router hydrates server HTML, so the provider cannot hold the tree back as Svelte and React do. The gates wait instead (each read capped at 1.5 s) and render `loading`, also in the server render. Re-read on sign-in, workspace switch and a token with a different plan; flags re-evaluate when the subscription, quota or entitlements store moves |

## Plan limits (levels 0 / 1 / 2)

| bridge-svelte | bridge-nextjs | Status |
|---|---|---|
| `bridgeFetch()` | same | added (TBP-742) |
| upgrade dialog on `402 QUOTA_EXCEEDED` / `402 FEATURE_NOT_IN_PLAN` (bridgeFetch + page-wide fetch) | same; the page-wide observer only looks at responses | added (TBP-742) |
| `<BridgeUpgradeDialog>`, `billing.upgradeDialog` (`false` / component), `billing.apiOrigins` | same | added (TBP-742) — a component is a function, so it is passed from a Client Component |
| `onBridgeQuotaExceeded`, `parseQuotaRefusal` | same | added (TBP-742) |
| `featureUpgrade` store, `openFeatureUpgrade`, `dismissFeatureUpgrade`, `parseFeatureRefusal` | `useUpgradeRequest()`, `openFeatureUpgrade`, `dismissFeatureUpgrade` | added (TBP-742) |
| `<QuotaGate>` | same (`atLimit` render-prop) | added (TBP-742) |
| `useQuota()` | same | added (TBP-742) |
| `<FeatureFlag upgrade>`, `openUpgrade` in the fallback info | same (`flagKey` prop: React reserves `key`) | added (TBP-742) |
| `entitlements` store, `<Entitled>` | `useEntitlements()`, `<Entitled>` | added (TBP-742) |
| dev warning when backend and page count the same metric (`X-Bridge-Usage-Counted`) | same (`bridgeFetch` and the page-wide fetch observer read the header; `bridge.usage.report` / `set` note the page's count) | added (TBP-948) |

## Feature flags, team, developer

| bridge-svelte | bridge-nextjs | Status |
|---|---|---|
| `<FeatureFlag>`, flag registry, `BridgeFlags`, identity helpers, context propagation | same (`useFlag`, `flagStore`) | present |
| `Team*` components, seats (`seatsMetric`) | same | present; documented in `mcp/team-prompt.md` and `learning/auth/ui/team-management.md` (TBP-948) |
| `ApiTokenManagement`, `ProfileName` | same | present |
| `sha256Email`, Reddit tracking | same | present |

## Agent guides (`mcp/`) and learning docs

| bridge-svelte | bridge-nextjs | Status |
|---|---|---|
| "The one rule for app code" block + `check gates` step (TBP-705) | billing, feature-flags, integration and branding guides | added (TBP-948); `src/doc-currency.test.ts` (ported) keeps every guide free of direct role, privilege and plan checks |
| MCP tools named next to the CLI; no "prefer the CLI" (TBP-576) | feature-flags and billing guides | added (TBP-948) |
| `mcp/branding-prompt.md` (TBP-573) | same | added (TBP-948) |
| `realtimeStatusDetail` reasons + troubleshooting link (TBP-642, TBP-675) | `learning/live-updates/live-updates.md` | added (TBP-948) |
| — | `src/guide-drift.test.ts`: every export, component, prop and config option a guide names exists | added (TBP-948), Next.js only |

## Styles

| bridge-svelte | bridge-nextjs | Status |
|---|---|---|
| `--bridge-*` token contract, defaults on `:where(:root)` | same stylesheet | added (TBP-742) — before, defaults sat on `:root` and the newer tokens were missing |

## TBP-515 acceptance criteria, Next.js column

| AC | Status |
|---|---|
| Parity matrix checked in | met — this file |
| Auth component surface (login, route guard, callback) | met — present before; the catch-all adds the callback page |
| Passkey components mirrored; simplewebauthn decision applied | met — fixed and the dependency made regular in this PR |
| S2 plan-card hooks (render-prop) documented | met — `planCard` (present), `planDescription` / `planFooter` (added) |
| `sdk-auth` guide for the framework | met — `learning/sdk-auth/sdk-quickstart.md` and `mcp/sdk-auth-prompt.md`, updated to the catch-all; already advertised for nextjs in bridge-cli's `prompts/guide-coverage.json` |
| Each landed component covered by tests | met — unit/component tests for every component added here |
