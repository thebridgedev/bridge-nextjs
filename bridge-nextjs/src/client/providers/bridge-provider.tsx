'use client';

import { FC, ReactNode, useEffect, useMemo, useRef } from 'react';
import { ensureAppConfig, getBridgeAuth, initBridge, markReady } from '../../core/bridge-instance';
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

  const initedRef = useRef(false);

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
    logger.debug('[BridgeProvider] bootstrap complete', mergedConfig);
  }

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

  return <>{children}</>;
};
