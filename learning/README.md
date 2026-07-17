# Bridge Next.js: Learning Docs

End-user documentation for `@nebulr-group/bridge-nextjs`. These docs assume the integration prompt (`mcp/integration-prompt.md`) is complete.

## Guide sections

- [auth/](./auth/auth.md): authentication end to end. Sign-in methods, UI components (login, signup, MFA, passkeys, magic link, SSO, team management, tokens), the user token, roles and privileges, route guards, API tokens, multi-tenancy, and the configuration reference.
- [billing/](./billing/how-it-works/how-it-works.md): subscriptions and payments. How billing works, Stripe setup, plan definition, onboarding users onto plans, plan limits and entitlements, subscription status, and lifecycle (trials, failed payments, billing events, billing portal).
- [feature-flags/](./feature-flags/feature-flags.md): feature flags. How flags work, getting started, using flags in UI/logic/routes, and targeting.

## Top-level guides

- [Quickstart (hosted auth)](./quickstart/hosted-quickstart.md): the fastest way to add authentication.
- [SDK Auth quickstart](./sdk-auth/sdk-quickstart.md): in-app auth UI, no redirect to Bridge hosted auth.
- [Live updates and the `bridge` object](./live-updates/live-updates.md): the unified `bridge` object, live channel events, and app-wide flag attributes.
- [Theming](./theming/theming.md): overriding default styles.
- [Branding](./branding/branding.md): per-workspace white-labeling with the live branding snapshot.

## Need help?

- Production API: `https://api.thebridge.dev`
- Bridge admin UI: `https://app.thebridge.dev`
- File issues at the bridge-nextjs repo.
