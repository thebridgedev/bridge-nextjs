import type { BridgeAuthConfig, MessageOverrides, ReturnToConfig } from '@nebulr-group/bridge-auth-core';
import type { ComponentType } from 'react';
import type { BridgeQuotaRefusal } from '../../core/quota-refusal';

export type { TokenSet } from '@nebulr-group/bridge-auth-core';

/**
 * bridge configuration interface.
 *
 * Extends `BridgeAuthConfig` from auth-core — all auth-core fields (`appId`,
 * `apiBaseUrl`, `callbackUrl`, `defaultRedirectRoute`, `loginRoute`, `debug`,
 * etc.) are inherited. This plugin adds Next.js-specific fields below.
 *
 * Each field resolves as *explicit option > environment > default* (see
 * `createBridgeConfig()`); an empty value counts as unset:
 * 1. Options passed to `<BridgeProvider config>` / `createBridgeConfig()`
 * 2. Environment variables — `NEXT_PUBLIC_BRIDGE_*`
 * 3. Default values
 *
 * @example Environment Variables (Recommended)
 * ```env
 * NEXT_PUBLIC_BRIDGE_APP_ID=your-app-id
 * NEXT_PUBLIC_BRIDGE_API_BASE_URL=https://api-stage.thebridge.dev   # only for a non-production app
 * NEXT_PUBLIC_BRIDGE_HOSTED_URL=http://localhost:3191              # only for a local/self-hosted Bridge
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
   * UI language for the SDK auth components, e.g. 'sv' or 'sv-SE' (TBP-630).
   * Region variants resolve to their primary subtag; an unknown locale falls
   * back to English rather than throwing.
   * @default 'en'
   */
  locale?: string;

  /**
   * Per-key copy overrides applied on top of the resolved locale, for wording
   * an app genuinely needs to differ. Highest precedence in the chain, and
   * layered under each component's own `messages` prop.
   */
  messages?: MessageOverrides;

  /**
   * Deep-link preservation for the client route guard and `withAuth` middleware
   * (TBP-629).
   *
   * When the guard turns an unauthenticated visitor away, the page they asked
   * for is remembered and restored after login. On by default — set
   * `{ enabled: false }` to send every login to the same place.
   */
  returnTo?: ReturnToConfig;

  /**
   * Show the "Live updates off — why?" corner badge that `<BridgeProvider>`
   * mounts while realtime is refused, degraded or stuck retrying (TBP-644).
   * It only ever renders in development builds (`NODE_ENV !== 'production'`);
   * set `false` to hide it there too. Production builds never show it.
   * @default true
   */
  devBadge?: boolean;

  /**
   * Billing destinations and the upgrade dialog. Every field is optional: with
   * nothing set, the destinations point at the pages
   * `app/subscription/[...bridge]/page.tsx` (`<BridgeBillingRoutes />`) serves.
   * Mirrors bridge-svelte's `billing` config.
   */
  billing?: {
    /**
     * Where a signed-in workspace with no plan is redirected. The default
     * applies only to an app that has plans (an app without billing has only
     * plan-less workspaces); a value set here always applies. `false` turns the
     * redirect off — for an app that gates with the `<BridgePaywall>` overlay,
     * or not at all. Workspaces of an app with `paymentsAutoRedirect` off are
     * never redirected.
     * @default '/subscription/plan'
     */
    paywallRoute?: string | false;
    /**
     * Where a failed Stripe checkout confirmation lands.
     * @default '/subscription/error'
     */
    paymentErrorRoute?: string;
    /**
     * The subscription page — the default destination of the Upgrade/Manage
     * CTA in `<BridgeQuotaBanner>`, `<BridgeBillingNotice>`, `<QuotaGate>` and
     * the upgrade dialog. A completed checkout lands on `<manageRoute>/success`.
     * @default '/subscription'
     */
    manageRoute?: string;
    /**
     * The dialog `<BridgeProvider>` opens when your backend refuses a request
     * because a plan limit is reached — a `402` whose JSON body has
     * `code: 'QUOTA_EXCEEDED'` (bridge-nestjs `@RequireQuota`), or because the
     * plan lacks a feature (`402 FEATURE_NOT_IN_PLAN`). `false` turns it off
     * (render your own from `useUpgradeRequest()`); a component replaces it and
     * receives `BridgeUpgradeDialogProps` — a component is a function, so pass
     * it from a Client Component.
     * @default true
     */
    upgradeDialog?: boolean | ComponentType<BridgeUpgradeDialogProps>;
    /**
     * Origins of your own backend when it is not on the page's origin, e.g.
     * `['https://api.example.com']`. A `402 QUOTA_EXCEEDED` from the page's
     * origin, from Bridge's API, or from a call made with `bridgeFetch()` is
     * always recognised; one from any other origin only when listed here.
     */
    apiOrigins?: string[];
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

/**
 * Props the upgrade dialog receives — the default one, or yours via
 * `billing.upgradeDialog: MyDialog`. Mirrors bridge-svelte.
 */
export interface BridgeUpgradeDialogProps {
  /** The plan-limit refusal to explain, or `null`. */
  refusal: BridgeQuotaRefusal | null;
  /** Where the upgrade button goes: the refusal's `fix` path, else `billing.manageRoute`. */
  upgradeHref: string;
  /**
   * Whether this user may manage billing (the `<BridgeQuotaBanner>` rule).
   * `false`: a member — tell them to contact the workspace owner instead.
   */
  canUpgrade: boolean;
  /** Close the dialog. */
  onClose: () => void;
  /**
   * The plan feature the user is missing. With no `refusal`, a non-null
   * `feature` opens the dialog in its feature variant. Set only after the
   * person did something gated (a `<FeatureFlag upgrade>` click, a
   * `402 FEATURE_NOT_IN_PLAN`); rendering a hidden feature never sets it.
   */
  feature?: string | null;
  /** The app's plans, each with the features it includes — used to name the plans that include `feature`. */
  plans?: ReadonlyArray<PlanWithFeatures> | null;
}

/** A plan as the plan list returns it, with the features it includes. */
export interface PlanWithFeatures {
  key: string;
  name: string;
  prices?: ReadonlyArray<{ amount: number }>;
  features?: ReadonlyArray<{ key: string; name: string }>;
}
