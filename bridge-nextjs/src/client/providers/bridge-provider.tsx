'use client';

import { usePathname, useRouter } from 'next/navigation';
import { FC, ReactNode, useEffect, useMemo, useRef } from 'react';
import { ensureAppConfig, getBridgeAuth, initBridge, markReady } from '../../core/bridge-instance';
import { startBridgeRuntime, stopBridgeRuntime } from '../../core/bridge-runtime';
import { createBridgeFlags, type BridgeFlagsBundle } from '../../flags/bootstrap';
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

  // Flush the realtime client + token subscription on provider unmount.
  useEffect(() => {
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

  // Paywall redirect — the CSR analogue of bridge-svelte's BridgeBootstrap
  // step 2b. Runs after bootstrap resolves auth. Redirects to the configured
  // paywall route only when:
  //   - billing.paywallRoute is configured
  //   - the current path is not already the paywall route (no redirect loop)
  //   - the tenant is authenticated but has not selected a plan
  //   - the app has not opted out via paymentsAutoRedirect: false
  // getSubscriptionStatus() self-heals after a Stripe round-trip: when a
  // checkout session_id is present (URL or sessionStorage), auth-core syncs the
  // completed session server-side first, so shouldSelectPlan reads false and a
  // freshly-paid user is NOT bounced back to the paywall.
  // Depend on PRIMITIVE values (paywallRoute, appId, pathname), NOT the
  // mergedConfig object. mergedConfig is recomputed whenever the `config` prop
  // identity changes (a consumer passing an inline object literal re-creates it
  // every render); depending on the object would re-fire this effect — and its
  // getSubscriptionStatus() network call — on every render. The primitives are
  // stable across renders, so the paywall check runs once per route.
  const paywallRoute = mergedConfig.billing?.paywallRoute;
  const paywallAppId = mergedConfig.appId;
  useEffect(() => {
    if (!paywallRoute || pathname === paywallRoute) return;
    if (typeof window === 'undefined' || !paywallAppId) return;

    let cancelled = false;
    void (async () => {
      try {
        const bridge = getBridgeAuth();
        if (!bridge.isAuthenticated()) return;
        const status = await bridge.getSubscriptionStatus();
        if (cancelled) return;
        if (status?.shouldSelectPlan === true && status?.paymentsAutoRedirect !== false) {
          logger.debug('[BridgeProvider] paywall redirect', paywallRoute);
          router.push(paywallRoute);
        }
      } catch (err) {
        // Non-fatal — fail open if the subscription fetch errors.
        logger.debug('[BridgeProvider] paywall check skipped:', err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pathname, paywallRoute, paywallAppId, router]);

  return <>{children}</>;
};
