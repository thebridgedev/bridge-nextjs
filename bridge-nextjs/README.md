<p align="center">
  <a href="https://thebridge.dev/?utm_source=npm&utm_medium=readme&utm_campaign=bridge-nextjs"><picture><source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/thebridgedev/bridge-nextjs/main/.github/assets/banner.png"><img src="https://raw.githubusercontent.com/thebridgedev/bridge-nextjs/main/.github/assets/banner-light.png" alt="The Bridge for Next.js" width="100%"></picture></a>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@nebulr-group/bridge-nextjs"><img src="https://img.shields.io/npm/v/@nebulr-group/bridge-nextjs?color=20006b&label=npm" alt="npm version"></a>
  <a href="https://github.com/thebridgedev/bridge-nextjs/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/@nebulr-group/bridge-nextjs?color=20006b" alt="MIT license"></a>
</p>

<p align="center">
  <a href="https://thebridge.dev/?utm_source=npm&utm_medium=readme&utm_campaign=bridge-nextjs"><b>Website</b></a> ·
  <a href="https://thebridge.dev/docs/quickstart/nextjs/?utm_source=npm&utm_medium=readme&utm_campaign=bridge-nextjs"><b>Quickstart</b></a> ·
  <a href="https://thebridge.dev/docs/?utm_source=npm&utm_medium=readme&utm_campaign=bridge-nextjs"><b>Docs</b></a> ·
  <a href="https://thebridge.dev/docs/ai-assistants/mcp/?utm_source=npm&utm_medium=readme&utm_campaign=bridge-nextjs"><b>Set up with your AI assistant</b></a>
</p>

# The Bridge for Next.js

`@nebulr-group/bridge-nextjs` adds sign-in, workspaces and roles, feature flags, Stripe subscriptions and plan limits to a Next.js App Router app, with one `.env` line and three files.

**[The Bridge](https://thebridge.dev/?utm_source=npm&utm_medium=readme&utm_campaign=bridge-nextjs)** is a hosted backend for SaaS apps. It gives you sign-in (passwords, magic links, passkeys, social login and SSO), multi-tenant workspaces with roles, Stripe subscriptions with plan limits, and feature flags, all managed from one dashboard. Your AI coding assistant can set it up for you through the [Bridge MCP server](https://thebridge.dev/docs/ai-assistants/mcp/?utm_source=npm&utm_medium=readme&utm_campaign=bridge-nextjs).

> **Let your AI assistant set it up.** Connect the [Bridge MCP server](https://thebridge.dev/docs/ai-assistants/mcp/?utm_source=npm&utm_medium=readme&utm_campaign=bridge-nextjs) to Claude, Cursor, Copilot or Gemini CLI and ask it to add Bridge to your app. Not using MCP? Run `npx @nebulr-group/bridge-cli guide add-login` in your project: it detects your framework from `package.json` and prints the steps for your assistant to follow. `npx @nebulr-group/bridge-cli doctor` checks the result.

## Install

```bash
npm install @nebulr-group/bridge-nextjs
```

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

Settings resolve as *explicit option > `NEXT_PUBLIC_BRIDGE_*` environment > default*. Plan limits need no page code: a backend `402 QUOTA_EXCEEDED` opens the upgrade dialog; `<QuotaGate>` and `useQuota()` are there when you want more. See [How Bridge works](https://github.com/thebridgedev/bridge-nextjs/blob/main/learning/mechanisms.md).

## Route protection

- **Hosted login** (no `loginRoute`): the session is a cookie, and the `withBridgeAuth` middleware is the route guard. It enforces unmatched routes under `defaultAccess: 'protected'` and any rule without `public: true`. It verifies the session token: its PS256 signature against the Bridge JWKS (`<apiBaseUrl>/auth/.well-known/jwks.json`), issuer `<apiBaseUrl>/auth`, audience containing your `appId`, and expiry; a failed check denies.
- **SDK auth** (`<LoginForm />`, `loginRoute` set): tokens live in the browser, where middleware cannot see them. `withBridgeAuth` steps aside for those requests (it is not authoritative there), and `<ProtectedRoute>` plus your API are the guards.
- **Neither route guard is authorization.** Every API route must verify the user's token itself.

See [Route guards](https://thebridge.dev/docs/auth/securing/route-guards/#which-layer-guards-what). To require sign-in and a feature flag on one route, put `featureFlag` on the `withBridgeAuth` rule: `{ match: '/beta', featureFlag: 'beta-access' }`.

## Learn more

- [Quickstart](https://thebridge.dev/docs/quickstart/nextjs/?utm_source=npm&utm_medium=readme&utm_campaign=bridge-nextjs)
- [Authentication](https://thebridge.dev/docs/auth/nextjs/?utm_source=npm&utm_medium=readme&utm_campaign=bridge-nextjs)
- [Sign-in inside your app](https://thebridge.dev/docs/sdk-auth/nextjs/?utm_source=npm&utm_medium=readme&utm_campaign=bridge-nextjs)
- [Feature flags](https://thebridge.dev/docs/feature-flags/nextjs/?utm_source=npm&utm_medium=readme&utm_campaign=bridge-nextjs)
- [Branding](https://thebridge.dev/docs/branding/nextjs/?utm_source=npm&utm_medium=readme&utm_campaign=bridge-nextjs)
- [Live updates](https://thebridge.dev/docs/live-updates/nextjs/?utm_source=npm&utm_medium=readme&utm_campaign=bridge-nextjs)
- [Subscriptions and plan limits](https://thebridge.dev/docs/billing/how-it-works/?utm_source=npm&utm_medium=readme&utm_campaign=bridge-nextjs)

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

[MIT](https://github.com/thebridgedev/bridge-nextjs/blob/main/LICENSE) © Nebulr. Built by [The Bridge](https://thebridge.dev/?utm_source=npm&utm_medium=readme&utm_campaign=bridge-nextjs).
