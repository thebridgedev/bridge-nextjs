# Changelog

All notable changes to this package are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the package uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.8.0] - 2026-09-30

### Added

- **The ten-line integration.** `createBridgeConfig()` reads your `NEXT_PUBLIC_BRIDGE_*` settings, one `app/auth/[...bridge]/page.tsx` serves every sign-in page and one `app/subscription/[...bridge]/page.tsx` serves the subscription pages and the paywall. To replace one of those pages with your own, create it. The separate provider wrapper and hand-written callback route are no longer needed.
- **Plan limit components and hooks.** Quota and entitlement components and hooks now match the other Bridge frameworks, and a request refused for a plan limit opens the upgrade dialog.
- **A feature that is off says why.** When a flag keeps something off, your app learns whether it is not on the plan (the upgrade dialog opens), not allowed for this person (they are told to ask an admin), or switched off (it is simply hidden).
- **Flag rules on the server.** A flag rule about a plan, role or privilege now gives the same answer on the server as in the browser, with no extra wiring.
- **Seat limits on the team page.** The built-in team page stops invitations once the workspace reaches its plan's seat limit.

### Changed

- **Breaking: new integration shape.** Options you pass explicitly now take precedence over environment settings, and the package requires `@nebulr-group/bridge-auth-core` 0.8.0. Move your sign-in and subscription pages to the two catch-all routes above and set up with `createBridgeConfig()`.

### Fixed

- **Hosted sign-in pages on staging.** An app pointed at a staging API now sends sign-in to that environment's hosted pages instead of production's.
- **Billing screens after checkout.** Returning from Stripe checkout shows the new plan straight away instead of "Subscription unavailable" until a reload, a paid checkout stays paid, and the billing pages ask for sign-in.
- **Live updates during a reconnect.** A change to a person's plan, role or access made while the live connection was reconnecting is no longer missed.

## [0.7.4] - 2026-09-26

### Fixed

- **Session snapshot on first connection.** After sign-in, the workspace name and id, the branding and the entitlements now appear immediately. Previously they stayed empty, so every entitlement check answered no and a paywall built on one would lock everyone out.
- **Live updates and browser usage reporting.** Live updates now connect, so plans, entitlements and usage counters refresh without a page reload, and usage reported from the browser is recorded. Previously the browser rejected these calls, so live updates never connected and browser-side usage reports were lost.
- **Documentation links.** Three pages in the guides linked to addresses with no page behind them; they now resolve.

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
