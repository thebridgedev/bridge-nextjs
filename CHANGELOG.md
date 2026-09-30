# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

The ten-line integration (TBP-742), ported from bridge-svelte 0.9.0.

### Breaking

- **Explicit options now win over the environment.** `<BridgeProvider appId config>`, `withBridgeAuth({ … })` and `getConfig(overrides)` used to let `NEXT_PUBLIC_BRIDGE_*` override what you passed. Every field now resolves as *explicit option > environment > default*, and an empty variable counts as unset. If you relied on an env var beating a hard-coded prop, remove the prop.
- **Billing destinations default to pages that exist.** `billing.manageRoute` defaults to `/subscription` (was `/billing`), `billing.paymentErrorRoute` to `/subscription/error` (was `/payment-error`), and `billing.paywallRoute` to `/subscription/plan` (was: no redirect). The default paywall applies only to an app that has plans. An app gating with the `<BridgePaywall>` overlay sets `billing: { paywallRoute: false }`; an app with its own pages sets the routes explicitly.

### Added

- `createBridgeConfig(options)` (from `/client` and `/server`): the one config resolver, reading `NEXT_PUBLIC_BRIDGE_APP_ID`, `_API_BASE_URL`, `_HOSTED_URL`, `_CALLBACK_URL`, `_DEFAULT_REDIRECT_ROUTE`, `_LOGIN_ROUTE`, `_SIGNUP_ROUTE`, `_DEBUG`. It throws naming `NEXT_PUBLIC_BRIDGE_APP_ID` when there is no app id.
- **A stage app's hosted pages follow its API address**: `api-stage.thebridge.dev` → `auth-stage.thebridge.dev`. `NEXT_PUBLIC_BRIDGE_HOSTED_URL` / `hostedUrl` is only for a local or self-hosted Bridge. Before, a stage app's hosted sign-in opened on production, where its app id does not exist.
- `<BridgeProvider config>` is plain data, so the Server Component `app/layout.tsx` passes it directly — no client "Providers" wrapper.
- `<BridgeAuthRoutes>`: `app/auth/[...bridge]/page.tsx` serves login, signup, oauth-callback (exchanged in the browser), set-password/[token], forgot-password, magic-link, setup-passkey/[token] and workspaces; an unknown segment is `notFound()`. `frame` / `heading` render-props; take over a page by creating it.
- `<BridgeBillingRoutes>`: `app/subscription/[[...bridge]]/page.tsx` serves `/subscription`, `/subscription/plan`, `/subscription/success`, `/subscription/error`. Plus `<BridgePaywallPage>` and `<BillingPortalButton>`.
- Plan limits, levels 0/1/2: `bridgeFetch()`; the upgrade dialog `<BridgeProvider>` mounts on a `402 QUOTA_EXCEEDED` or `402 FEATURE_NOT_IN_PLAN` (from `bridgeFetch` or a plain `fetch` to the page's origin, Bridge's API or `billing.apiOrigins`); `billing.upgradeDialog` (`false` or your component); `onBridgeQuotaExceeded()`, `useUpgradeRequest()`; `<QuotaGate metric>`; `useQuota(metric)`; `<FeatureFlag upgrade>` and `openUpgrade` in the fallback's info; `<Entitled to>` / `useEntitlements()` for the no-flag exception.
- `<PlanSelector>`: `planDescription` and `planFooter` render-props (S2 customization, TBP-515); `successUrl` / `cancelUrl` are optional and accept a path.
- `headingSlot` on `SignupForm`, `ForgotPassword`, `MagicLink` and `PasskeySetup` (main step only).
- Styles: the bridge-svelte `--bridge-*` token contract, with defaults on `:where(:root)` so your `:root` always wins.
- Docs: `learning/mechanisms.md`; `docs/parity-with-svelte.md`; `RouteRule.featureFlag` documented as the way to combine sign-in and a flag in one middleware (Next.js runs one `middleware.ts`, so `withBridgeAuth` and `withFeatureFlags` cannot both be it).

### Fixed

- **Passkeys work.** `<PasskeyLogin>` called `authenticateWithPasskey()` with no browser response, and `<PasskeySetup>` called a `registerPasskeyWithToken()` auth-core does not have, so neither passkey sign-in nor passkey setup could succeed. Both now run the WebAuthn ceremony (auth-core options → `@simplewebauthn/browser` → auth-core verification). `@simplewebauthn/browser` is a regular dependency, the decision bridge-svelte made (TBP-515).
- Docs: the set-password and setup-passkey page snippets use Next.js 15's `params: Promise<…>`; the guides say again that `/auth/set-password/[token]` is where signup-verification and password-reset emails land, so leaving it out 404s every new signup.

## [0.2.1] - 2025-02-17

### Added

- Install test: `npm run test:install` and CI workflow to verify the packed package installs with Next 15 and Next 16 (catches peer dependency / ERESOLVE issues before publish).

### Changed

- Peer dependency `next` updated to `^15.0.0 || ^16.0.0` for Next 16 compatibility.

### Fixed

- ERESOLVE when installing in apps using Next 16.
- CI and install test use npm only (removed pnpm) to avoid Turborepo "multiple package managers" error.

## [0.2.0] - 2025-02-15

### Changed

- Documentation: README, quickstart, and examples updated for consistency and correctness.
- Package name and imports: all examples use `@nebulr-group/bridge-nextjs` with correct subpaths (`/client` and `/server`).
- Server-side feature flags: API route examples use `FeatureFlagServer.getInstance().isFeatureEnabledServer(flagName, request)` instead of the previous `isFeatureEnabledServer(flagName, accessToken)` (which was not exported).
- Route protection: removed reference to non-existent `ServerAuthCheck`; documented middleware (`withBridgeAuth`) and client `ProtectedRoute` from `@nebulr-group/bridge-nextjs/client`.
- Consistent "Bridge" product naming in docs.

### Fixed

- Doc links: quickstart and examples now point to `learning/quickstart/quickstart.md` and `learning/examples/examples.md`.
- Installation: README shows correct package `@nebulr-group/bridge-nextjs`.

## [0.1.0] - Previous

Initial release.

[0.2.1]: https://github.com/thebridgedev/bridge-nextjs/releases/tag/v0.2.1
[0.2.0]: https://github.com/thebridgedev/bridge-nextjs/releases/tag/v0.2.0
[0.1.0]: https://github.com/thebridgedev/bridge-nextjs/releases/tag/v0.1.0
