'use client';

import { usePathname, useRouter } from 'next/navigation';
import { FC, ReactNode, useEffect, useMemo, useRef } from 'react';
import { ensureAppConfig, getBridgeAuth, initBridge, markReady, useBridgeStore } from '../../core/bridge-instance';
import { startBridgeRuntime, stopBridgeRuntime } from '../../core/bridge-runtime';
import { createBridgeFlags, type BridgeFlagsBundle } from '../../flags/bootstrap';
import { RealtimeDevBadge } from '../components/developer/RealtimeDevBadge';
import { logger, setLoggerDebug } from '../../shared/logger';
import { BridgeConfig } from '../../shared/types/config';

interface BridgeProviderProps {
  /** Your bridge application ID — can be provided directly or via config. */
  appId?: string;
  /** Full bridge configuration object. */
  config?: BridgeConfig;
  children: ReactNode;
}

const DEFAULT_CONFIG: Partial<BridgeConfig> = {
  apiBaseUrl: 'https://api.thebridge.dev',
  defaultRedirectRoute: '/',
  signupRoute: '/auth/signup',
  debug: false,
};

const DEFAULT_CALLBACK_PATH = '/auth/oauth-callback';

function getConfigFromEnv(): Partial<BridgeConfig> {
  const envConfig: Partial<BridgeConfig> = {};
  const appId = process.env.NEXT_PUBLIC_BRIDGE_APP_ID;
  const apiBaseUrl = process.env.NEXT_PUBLIC_BRIDGE_API_BASE_URL;
  const callbackUrl = process.env.NEXT_PUBLIC_BRIDGE_CALLBACK_URL;
  const defaultRedirectRoute = process.env.NEXT_PUBLIC_BRIDGE_DEFAULT_REDIRECT_ROUTE;
  const loginRoute = process.env.NEXT_PUBLIC_BRIDGE_LOGIN_ROUTE;
  const signupRoute = process.env.NEXT_PUBLIC_BRIDGE_SIGNUP_ROUTE;
  const debug = process.env.NEXT_PUBLIC_BRIDGE_DEBUG;
  if (appId) envConfig.appId = appId;
  if (apiBaseUrl) envConfig.apiBaseUrl = apiBaseUrl;
  if (callbackUrl) envConfig.callbackUrl = callbackUrl;
  if (defaultRedirectRoute) envConfig.defaultRedirectRoute = defaultRedirectRoute;
  if (loginRoute) envConfig.loginRoute = loginRoute;
  if (signupRoute) envConfig.signupRoute = signupRoute;
  if (debug !== undefined) envConfig.debug = debug === 'true';
  return envConfig;
}

/**
 * Main provider for bridge functionality.
 *
 * **Init timing.** `initBridge()` is called synchronously during the first
 * client render — NOT inside `useEffect`. Child effects fire before parent
 * effects in React's commit order, so any child that calls `getBridgeAuth()`
 * (e.g. `<LoginForm>` calling `ensureAppConfig`) would throw "not initialized"
 * if we deferred init to our own `useEffect`. Initializing during render is
 * safe because `initBridge()` is idempotent and a ref guards against double-runs.
 *
 * Mirrors bridge-svelte's `bridgeConfig.initConfig` call from `+layout.ts`,
 * which similarly runs before any reactive consumer mounts.
 */
export const BridgeProvider: FC<BridgeProviderProps> = ({ appId, config, children }) => {
  const mergedConfig = useMemo<BridgeConfig>(() => {
    const envConfig = getConfigFromEnv();
    const fromProps = appId ? { ...config, appId } : config;
    const defaultCallback =
      typeof window !== 'undefined'
        ? `${window.location.origin}${DEFAULT_CALLBACK_PATH}`
        : undefined;
    return {
      ...DEFAULT_CONFIG,
      ...(defaultCallback ? { callbackUrl: defaultCallback } : {}),
      ...fromProps,
      ...envConfig,
    } as BridgeConfig;
  }, [appId, config]);

  const router = useRouter();
  const pathname = usePathname();

  const initedRef = useRef(false);
  const flagsBundleRef = useRef<BridgeFlagsBundle | null>(null);

  // Synchronous client-side init. Runs once per provider instance.
  if (typeof window !== 'undefined' && !initedRef.current && mergedConfig.appId) {
    initedRef.current = true;
    setLoggerDebug(!!mergedConfig.debug);

    if (typeof sessionStorage !== 'undefined') {
      try {
        const sessionId = new URL(window.location.href).searchParams.get('session_id');
        if (sessionId) sessionStorage.setItem('bridge_checkout_session_id', sessionId);
      } catch {
        /* sessionStorage may be disabled — non-fatal */
      }
    }

    initBridge(mergedConfig);
    useBridgeStore.setState({ billing: mergedConfig.billing ?? null });
    markReady();
    // Mount the core Bridge runtime (realtime channel + session.snapshot fanout
    // + dev-attribute provider). Idempotent; reads appId/apiBaseUrl from the
    // BridgeAuth API context populated by initBridge() above. Mirrors
    // bridge-svelte's <BridgeBootstrap /> onMount → startBridgeRuntime().
    startBridgeRuntime();
    // Mount Feature Flags 2.0 ON TOP OF the core runtime — must run AFTER
    // startBridgeRuntime() so the flag cache attaches to the shared realtime
    // channel (no second websocket). Window-guarded above; createBridgeFlags
    // registers the global instance used by useFlag / <FeatureFlag>. Guarded so
    // a missing appId / standalone harness doesn't crash bootstrap.
    try {
      flagsBundleRef.current = createBridgeFlags();
    } catch (err) {
      logger.debug('[BridgeProvider] feature flags bootstrap skipped:', err);
    }
    logger.debug('[BridgeProvider] bootstrap complete', mergedConfig);
  }

  // Own the runtime's mounted lifetime: (re)start on mount, flush the realtime
  // client + token subscriptions on unmount.
  //
  // The start above happens during render so children can read the singleton in
  // their own effects — but render runs ONCE while effects can run many times.
  // Under React 18/19 StrictMode — which Next.js enables by default
  // (`reactStrictMode: true`) — the dev-only double-invoke simulates a full
  // mount → unmount → remount on the same fiber: the cleanup below fires, but
  // the component does NOT re-render, so `initedRef` still reads "initialized"
  // and nothing would ever restart what the cleanup tore down. The result was a
  // dev-only dead runtime — no realtime channel, no session.snapshot fanout, no
  // live flag updates, no token-driven channel rescoping — for the whole page
  // lifetime.
  //
  // So the effect re-asserts the runtime instead of assuming render did it.
  // `startBridgeRuntime()` is idempotent and `flagsBundleRef` is nulled by the
  // cleanup, so on a genuine first mount both calls below are no-ops, and on a
  // StrictMode remount they rebuild exactly what was torn down.
  useEffect(() => {
    if (!initedRef.current) return; // no appId / SSR — nothing was ever started

    startBridgeRuntime();
    if (!flagsBundleRef.current) {
      try {
        flagsBundleRef.current = createBridgeFlags();
      } catch (err) {
        logger.debug('[BridgeProvider] feature flags bootstrap skipped:', err);
      }
    }

    return () => {
      if (flagsBundleRef.current) {
        void flagsBundleRef.current.stop();
        flagsBundleRef.current = null;
      }
      void stopBridgeRuntime();
    };
  }, []);

  // Background tasks deferred to useEffect (won't block initial paint).
  useEffect(() => {
    if (!mergedConfig.appId) {
      logger.warn(
        '[BridgeProvider] No appId provided. Set NEXT_PUBLIC_BRIDGE_APP_ID or pass appId prop.'
      );
      return;
    }
    void (async () => {
      try {
        const bridge = getBridgeAuth();
        if (bridge.isAuthenticated()) {
          await bridge.refreshTokens();
        }
      } catch (err) {
        logger.debug('[BridgeProvider] token refresh skipped:', err);
      }
    })();
    void ensureAppConfig();
  }, [mergedConfig]);

  // Paywall + checkout-return-error redirect — the CSR analogue of
  // bridge-svelte's BridgeBootstrap steps 2b/confirm-checkout. Runs after
  // bootstrap resolves auth, and covers two destinations:
  //   - billing.paywallRoute: redirect there when authenticated but no plan
  //     selected, unless paymentsAutoRedirect: false.
  //   - billing.paymentErrorRoute: redirect there when a Stripe checkout the
  //     user just returned from (session_id in the URL or sessionStorage, set
  //     during bootstrap) resolved with paymentFailed. This is the
  //     checkout-round-trip case only — a persistent/recurring payment
  //     failure with no pending session is left to PlanSelector's inline
  //     'payment-failed' banner, not redirected here.
  //
  // Two paths, deliberately:
  //   1. Checkout return (a pending session id exists). Only here do we spend a
  //      getSubscriptionStatus() call — it is the one authoritative source for
  //      `paymentFailed`, and auth-core self-heals inside it by syncing the
  //      completed Stripe session server-side first, so a freshly-paid user
  //      reads shouldSelectPlan: false and is NOT bounced back to the paywall.
  //      The paywall decision on this path therefore uses that same fresh
  //      `status` rather than shouldRedirectToPaywall(), whose JWT claims are
  //      still pre-payment until the next token refresh.
  //   2. Ordinary mount. shouldRedirectToPaywall() (auth-core) bundles the auth
  //      check + the shouldSelectPlan/paymentsAutoRedirect decision (TBP-369),
  //      shared with bridge-svelte/react/angular, and is claim-driven — zero
  //      network on the hot path (TBP-368).
  //
  // `pendingSessionId` MUST be read before getSubscriptionStatus(): that call
  // strips `?session_id=` from the URL and clears the sessionStorage copy as
  // part of its self-heal.
  //
  // Depend on PRIMITIVE values (routes, appId, pathname), NOT the
  // mergedConfig object. mergedConfig is recomputed whenever the `config` prop
  // identity changes (a consumer passing an inline object literal re-creates it
  // every render); depending on the object would re-fire this effect — and its
  // getSubscriptionStatus() network call — on every render. The primitives are
  // stable across renders, so the check runs once per route.
  const paywallRoute = mergedConfig.billing?.paywallRoute;
  const paymentErrorRoute = mergedConfig.billing?.paymentErrorRoute;
  const paywallAppId = mergedConfig.appId;
  useEffect(() => {
    if (!paywallRoute && !paymentErrorRoute) return;
    if (typeof window === 'undefined' || !paywallAppId) return;
    if (pathname === paywallRoute || pathname === (paymentErrorRoute ?? '/payment-error')) return;

    let cancelled = false;
    void (async () => {
      try {
        const bridge = getBridgeAuth();

        let pendingSessionId: string | null = null;
        try {
          pendingSessionId =
            new URL(window.location.href).searchParams.get('session_id') ??
            (typeof sessionStorage !== 'undefined'
              ? sessionStorage.getItem('bridge_checkout_session_id')
              : null);
        } catch {
          /* sessionStorage may be disabled — non-fatal */
        }

        // Path 1 — returning from Stripe Checkout.
        if (pendingSessionId) {
          if (!bridge.isAuthenticated()) return;
          const status = await bridge.getSubscriptionStatus();
          if (cancelled) return;

          if (status?.paymentFailed === true) {
            try {
              sessionStorage.removeItem('bridge_checkout_session_id');
            } catch {
              /* non-fatal */
            }
            const target = paymentErrorRoute ?? '/payment-error';
            logger.debug('[BridgeProvider] checkout-return payment failure, redirecting', target);
            router.push(target);
            return;
          }

          if (
            paywallRoute &&
            status?.shouldSelectPlan === true &&
            status?.paymentsAutoRedirect !== false
          ) {
            logger.debug('[BridgeProvider] paywall redirect', paywallRoute);
            router.push(paywallRoute);
          }
          return;
        }

        // Path 2 — ordinary mount.
        if (!paywallRoute) return;
        const should = await bridge.shouldRedirectToPaywall();
        if (cancelled) return;
        if (should) {
          logger.debug('[BridgeProvider] paywall redirect', paywallRoute);
          router.push(paywallRoute);
        }
      } catch (err) {
        // Non-fatal — fail open if the subscription fetch errors.
        logger.debug('[BridgeProvider] paywall/payment-error check skipped:', err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pathname, paywallRoute, paymentErrorRoute, paywallAppId, router]);

  // TBP-644 — the "Live updates off — why?" badge, mounted here so every app
  // gets it without code changes. Development builds only (the component
  // checks NODE_ENV); `config.devBadge: false` turns it off there too.
  return (
    <>
      {children}
      <RealtimeDevBadge enabled={mergedConfig.devBadge !== false} />
    </>
  );
};
