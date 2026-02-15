# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[0.2.0]: https://github.com/thebridgedev/bridge-nextjs/releases/tag/v0.2.0
[0.1.0]: https://github.com/thebridgedev/bridge-nextjs/releases/tag/v0.1.0
