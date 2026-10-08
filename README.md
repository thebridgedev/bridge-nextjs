<p align="center">
  <a href="https://thebridge.dev/?utm_source=github&utm_medium=readme&utm_campaign=bridge-nextjs"><picture><source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/thebridgedev/bridge-nextjs/main/.github/assets/banner.png"><img src="https://raw.githubusercontent.com/thebridgedev/bridge-nextjs/main/.github/assets/banner-light.png" alt="The Bridge for Next.js" width="100%"></picture></a>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@nebulr-group/bridge-nextjs"><img src="https://img.shields.io/npm/v/@nebulr-group/bridge-nextjs?color=20006b&label=npm" alt="npm version"></a>
  <a href="https://github.com/thebridgedev/bridge-nextjs/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/@nebulr-group/bridge-nextjs?color=20006b" alt="MIT license"></a>
</p>

<p align="center">
  <a href="https://thebridge.dev/?utm_source=github&utm_medium=readme&utm_campaign=bridge-nextjs"><b>Website</b></a> ·
  <a href="https://thebridge.dev/docs/quickstart/nextjs/?utm_source=github&utm_medium=readme&utm_campaign=bridge-nextjs"><b>Quickstart</b></a> ·
  <a href="https://thebridge.dev/docs/?utm_source=github&utm_medium=readme&utm_campaign=bridge-nextjs"><b>Docs</b></a> ·
  <a href="https://thebridge.dev/docs/ai-assistants/mcp/?utm_source=github&utm_medium=readme&utm_campaign=bridge-nextjs"><b>Set up with your AI assistant</b></a>
</p>

# The Bridge for Next.js

`@nebulr-group/bridge-nextjs` adds sign-in, workspaces and roles, feature flags, Stripe subscriptions and plan limits to a Next.js App Router app, with one `.env` line and three files.

**[The Bridge](https://thebridge.dev/?utm_source=github&utm_medium=readme&utm_campaign=bridge-nextjs)** is a hosted backend for SaaS apps. It gives you sign-in (passwords, magic links, passkeys, social login and SSO), multi-tenant workspaces with roles, Stripe subscriptions with plan limits, and feature flags, all managed from one dashboard. Your AI coding assistant can set it up for you through the [Bridge MCP server](https://thebridge.dev/docs/ai-assistants/mcp/?utm_source=github&utm_medium=readme&utm_campaign=bridge-nextjs).

> **Let your AI assistant set it up.** Connect the [Bridge MCP server](https://thebridge.dev/docs/ai-assistants/mcp/?utm_source=github&utm_medium=readme&utm_campaign=bridge-nextjs) to Claude, Cursor, Copilot or Gemini CLI and ask it to add Bridge to your app. Not using MCP? Run `npx @nebulr-group/bridge-cli guide add-login` in your project: it detects your framework from `package.json` and prints the steps for your assistant to follow. `npx @nebulr-group/bridge-cli doctor` checks the result.

## Quick links
- [How Bridge works](learning/mechanisms.md) - the whole integration, plan limits, and customising Bridge's pages
- [SDK auth quickstart](learning/sdk-auth/sdk-quickstart.md) / [Hosted auth quickstart](learning/quickstart/hosted-quickstart.md)
- [Parity with bridge-svelte](docs/parity-with-svelte.md)

## The whole integration

One line of `.env` and three files. Every other page Bridge needs, it serves.

```env
# .env.local
NEXT_PUBLIC_BRIDGE_APP_ID=your-app-id
# only for a stage/local app — the hosted sign-in pages follow it:
# NEXT_PUBLIC_BRIDGE_API_BASE_URL=https://api-stage.thebridge.dev
```

```tsx
// app/layout.tsx — stays a Server Component; the config is plain data
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
// app/auth/[...bridge]/page.tsx — login, signup, oauth-callback, set-password/[token],
// forgot-password, magic-link, setup-passkey/[token], workspaces
import { BridgeAuthRoutes } from '@nebulr-group/bridge-nextjs/client';
export default function AuthPage() {
  return <BridgeAuthRoutes />;
}
```

```tsx
// app/subscription/[[...bridge]]/page.tsx — /subscription, /plan (the paywall), /success, /error
import { BridgeBillingRoutes } from '@nebulr-group/bridge-nextjs/client';
export default function SubscriptionPage() {
  return <BridgeBillingRoutes />;
}
```

Settings resolve as *explicit option > `NEXT_PUBLIC_BRIDGE_*` environment > default*. Plan limits need no page code: a backend `402 QUOTA_EXCEEDED` opens the upgrade dialog; `<QuotaGate>` and `useQuota()` are there when you want more. See [How Bridge works](learning/mechanisms.md).

## Table of Contents

- [Installation](#installation)
- [Configuration](#configuration)
- [Authentication](#authentication)
- [Feature Flags](#feature-flags)
- [Payments & Subscriptions](#payments--subscriptions)
- [Demo Application](#demo-application)
- [E2E Tests](#e2e-tests)
- [Publishing & Release](#publishing--release)

## Installation

```bash
npm install @nebulr-group/bridge-nextjs
```

## Configuration

See the [configuration reference](learning/auth/config/config.md).

## Authentication

For authentication examples and implementation details, see:
- [SDK auth quickstart](learning/sdk-auth/sdk-quickstart.md)
- [Hosted auth quickstart](learning/quickstart/hosted-quickstart.md)

### Route protection: which layer guards what

- **Hosted login** (no `loginRoute`): the session is a cookie, and the `withBridgeAuth` middleware is the route guard. It enforces unmatched routes under `defaultAccess: 'protected'` and any rule without `public: true`. It verifies the session token: its PS256 signature against the Bridge JWKS (`<apiBaseUrl>/auth/.well-known/jwks.json`), issuer `<apiBaseUrl>/auth`, audience containing your `appId`, and expiry; a failed check denies.
- **SDK auth** (`<LoginForm />`, `loginRoute` set): tokens live in the browser, where middleware cannot see them. `withBridgeAuth` steps aside for those requests (it is not authoritative there), and `<ProtectedRoute>` plus your API are the guards.
- **Neither route guard is authorization.** Every API route must verify the user's token itself.

See [Route guards](learning/auth/securing/route-guards.md#which-layer-guards-what).

## Feature Flags

For feature flag examples and implementation details, see:
- [Feature flags](learning/feature-flags/feature-flags.md). To gate a route by sign-in and a flag together, put `featureFlag` on a `withBridgeAuth` rule (Next.js runs one middleware): see [Route guards](learning/auth/securing/route-guards.md#sign-in-and-a-feature-flag-on-the-same-route).

## Payments & Subscriptions

`app/subscription/[[...bridge]]/page.tsx` serves the subscription page, the paywall and the checkout return pages. See [Add billing to your app](learning/billing/setup/add-billing-to-your-app.md) and [Usage limits](learning/billing/limits/usage-limits.md).

## Demo Application

The demo application (`demo/`) is the ten-line shape above plus example pages. Its one demo-only file, `demo/src/test-fixtures/TestBridgeProvider.tsx`, passes the E2E harness's per-worker app id to `<BridgeProvider>`; a real app renders `<BridgeProvider>` directly.

## E2E Tests

E2E tests use Playwright. Run them from the repo root.

1. **Configure env:** Copy `config/.env.test.local.example` to `config/.env.test.local` and fill in the values (test data API key, etc.).
2. **Pre-setup:** The first step of `test:e2e` runs a pre-setup script that creates/gets the test app and, for local runs only, writes `config/.env.demo.test.local` (the local API root depends on your slot). `config/.env.demo.test.stage` and `config/.env.demo.test.prod` are tracked in git with every key explicit.
3. **Global setup:** resolves the app id from the test-data API and seeds it into the browser as `localStorage['bridge:appId']`, which the demo passes to `BridgeProvider` (via `demo/src/test-fixtures/TestBridgeProvider.tsx`) — the demo env files deliberately leave `NEXT_PUBLIC_BRIDGE_APP_ID` empty. It then asserts that the demo is serving the environment the Playwright project targets (env pill, API root, and the requests the SDK makes on boot), so a stage run can never quietly drive a local or production backend.
4. **Install browsers (once):** `npx playwright install`
5. **Run tests** (always through these scripts — they pass the environment to the webServer that starts the demo on port 3010):
   - `npm run test:e2e` — local
   - `npm run test:e2e:stage` — stage
   - `npm run test:e2e:prod` — prod
   - `npm run test:e2e:headed` — local with browser visible
   - `npm run test:e2e:report` — open last HTML report

### Parallelism: one Bridge app per worker

`paymentsAutoRedirect`, `stripeEnabled`, the SSO flags and the plan catalogue are **app-level** settings. Global setup therefore provisions one Bridge app per Playwright worker (`BRIDGE_NEXTJS_TEST_DASHBOARD`, `…_W1`, `…_W2`, … — idempotent by domain and reused across runs; worker 0 keeps the unsuffixed domain), ensures the `TEAM` plan every test account is created on, and seeds each worker's app id into that worker's browser storage. A spec that changes an app-level setting restores it in a `finally`; the `appConfigBaseline` fixture re-applies the baseline if a spec died before its `finally` ran. No spec may delete or rename a plan other specs depend on — use `clearTenantPlan` to put one tenant in the "no plan" state.

## Publishing & Release

Bridge Next.js is published to npm via GitHub Actions. To release a new version, update the version in `bridge-nextjs/package.json`, merge to `main`, and tag the release (e.g. `v0.1.0`).

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for details.

## Learn more

- [Quickstart](https://thebridge.dev/docs/quickstart/nextjs/?utm_source=github&utm_medium=readme&utm_campaign=bridge-nextjs)
- [Authentication](https://thebridge.dev/docs/auth/nextjs/?utm_source=github&utm_medium=readme&utm_campaign=bridge-nextjs)
- [Sign-in inside your app](https://thebridge.dev/docs/sdk-auth/nextjs/?utm_source=github&utm_medium=readme&utm_campaign=bridge-nextjs)
- [Feature flags](https://thebridge.dev/docs/feature-flags/nextjs/?utm_source=github&utm_medium=readme&utm_campaign=bridge-nextjs)
- [Branding](https://thebridge.dev/docs/branding/nextjs/?utm_source=github&utm_medium=readme&utm_campaign=bridge-nextjs)
- [Live updates](https://thebridge.dev/docs/live-updates/nextjs/?utm_source=github&utm_medium=readme&utm_campaign=bridge-nextjs)
- [Subscriptions and plan limits](https://thebridge.dev/docs/billing/how-it-works/?utm_source=github&utm_medium=readme&utm_campaign=bridge-nextjs)

## Other Bridge packages

| Package | For |
|---|---|
| [`@nebulr-group/bridge-svelte`](https://www.npmjs.com/package/@nebulr-group/bridge-svelte) | SvelteKit |
| [`@nebulr-group/bridge-react`](https://www.npmjs.com/package/@nebulr-group/bridge-react) | React |
| [`@nebulr-group/bridge-angular`](https://www.npmjs.com/package/@nebulr-group/bridge-angular) | Angular |
| [`@nebulr-group/bridge-nestjs`](https://www.npmjs.com/package/@nebulr-group/bridge-nestjs) | NestJS |
| [`@nebulr-group/bridge-express`](https://www.npmjs.com/package/@nebulr-group/bridge-express) | Express |
| [`@nebulr-group/bridge-cli`](https://www.npmjs.com/package/@nebulr-group/bridge-cli) | CLI for people and AI agents |
| [`@nebulr-group/bridge-auth-core`](https://www.npmjs.com/package/@nebulr-group/bridge-auth-core) | Any JavaScript app (core) |

## License

[MIT](https://github.com/thebridgedev/bridge-nextjs/blob/main/LICENSE) © Nebulr. Built by [The Bridge](https://thebridge.dev/?utm_source=github&utm_medium=readme&utm_campaign=bridge-nextjs).
