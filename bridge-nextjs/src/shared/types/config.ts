import type { BridgeAuthConfig } from '@nebulr-group/bridge-auth-core';

export type { TokenSet } from '@nebulr-group/bridge-auth-core';

/**
 * bridge configuration interface.
 *
 * Extends `BridgeAuthConfig` from auth-core — all auth-core fields (`appId`,
 * `apiBaseUrl`, `callbackUrl`, `defaultRedirectRoute`, `loginRoute`, `debug`,
 * etc.) are inherited. This plugin adds Next.js-specific fields below.
 *
 * Configuration can be provided via:
 * 1. Environment variables (recommended) — prefixed with `NEXT_PUBLIC_BRIDGE_*`
 * 2. Props passed to `<BridgeProvider>`
 * 3. Default values
 *
 * @example Environment Variables (Recommended)
 * ```env
 * NEXT_PUBLIC_BRIDGE_APP_ID=your-app-id
 * NEXT_PUBLIC_BRIDGE_API_BASE_URL=https://api.thebridge.dev
 * NEXT_PUBLIC_BRIDGE_DEBUG=true
 * ```
 */
export interface BridgeConfig extends BridgeAuthConfig {
  /**
   * Route where your signup page lives (e.g. `/auth/signup`).
   * Used by SDK auth components to link to the signup page.
   * @env NEXT_PUBLIC_BRIDGE_SIGNUP_ROUTE
   */
  signupRoute?: string;

  /**
   * Billing paywall configuration. When set, Bridge redirects authenticated
   * users that still have to pick a plan (`shouldSelectPlan === true` and the
   * app has not opted out via `paymentsAutoRedirect: false`) to `paywallRoute`
   * before the page renders. Mirrors bridge-svelte's `billing` config.
   */
  billing?: {
    /**
     * Route to redirect to when the tenant has no plan selected.
     * e.g. `/welcome`, `/onboarding/plan`, or `/subscription`.
     */
    paywallRoute?: string;
    /**
     * Route to redirect to when a Stripe checkout confirmation fails.
     * Defaults to `/payment-error`.
     */
    paymentErrorRoute?: string;
  };

  // ── Legacy fields (pre-auth-core era) — kept for backward compatibility ──
  // New code should prefer `apiBaseUrl` (inherited from BridgeAuthConfig),
  // which auth-core uses to derive all needed endpoint URLs internally.

  /**
   * @deprecated Use `apiBaseUrl` (inherited from `BridgeAuthConfig`) instead.
   * auth-core derives the auth endpoint from `apiBaseUrl`.
   * @env NEXT_PUBLIC_BRIDGE_AUTH_BASE_URL
   */
  authBaseUrl?: string;

  /**
   * @deprecated The SDK team panel renders in-app — there is no separate portal URL.
   * @env NEXT_PUBLIC_BRIDGE_TEAM_MANAGEMENT_URL
   */
  teamManagementUrl?: string;

  /**
   * @deprecated Use `apiBaseUrl` (inherited from `BridgeAuthConfig`) instead.
   * auth-core derives cloud-views endpoints from `apiBaseUrl`.
   * @env NEXT_PUBLIC_BRIDGE_CLOUD_VIEWS_URL
   */
  cloudViewsUrl?: string;
}
