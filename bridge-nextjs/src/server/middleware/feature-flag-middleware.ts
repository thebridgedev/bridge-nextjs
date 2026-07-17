import { NextRequest, NextResponse } from 'next/server';
import { BRIDGE_CONTEXT_HEADER } from '@nebulr-group/bridge-auth-core';
import { logger } from '../../shared/logger';
import { BridgeConfig } from '../../shared/types/config';
import { FeatureFlagServer } from '../utils/feature-flag.server';
import { getConfig } from '../utils/get-config';
import { isApiRequest } from '../utils/is-api-request';

export interface FeatureFlagProtection {
  flag: string;
  paths: string[];
  redirectTo?: string;
  config?: Partial<BridgeConfig>;
  responseType?: 'redirect' | 'error';
  errorStatus?: number;
  errorMessage?: string;
}

export interface WithFeatureFlagOptions {
  config?: Partial<BridgeConfig> & {
    redirectRoute?: string;
  };
  fallbackPaths?: string[];
  responseType?: 'redirect' | 'error';
  errorStatus?: number;
  errorMessage?: string;
}

/**
 * Propagate the eval context to downstream Bridge backends. Mirrors nestjs's
 * `BridgeContextInterceptor` wire contract: the serialized context rides the
 * `x-bridge-context` header so nestjs/express services bucket the same identity.
 *
 * Next.js middleware can forward request headers to the downstream handler via
 * `NextResponse.next({ request: { headers } })`, so the propagated context is
 * available to API route handlers / server components in the same app, and to
 * any backend the app proxies to.
 */
function withContextHeader(request: NextRequest): NextResponse {
  const featureFlagServer = FeatureFlagServer.getInstance();
  const serialized = featureFlagServer.serializeContextForRequest(request);
  if (!serialized) {
    return NextResponse.next();
  }
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(BRIDGE_CONTEXT_HEADER, serialized);
  return NextResponse.next({ request: { headers: requestHeaders } });
}

/**
 * Creates a middleware function that protects multiple routes with feature flags
 * (FF 2.0 — local backend-mode eval via `FeatureFlagServer`). Export name kept
 * stable (§0 hard-rule 6).
 */
export function withFeatureFlags(protections: FeatureFlagProtection[]) {
  const defaultConfig = getConfig();
  const featureFlagServer = FeatureFlagServer.getInstance();
  featureFlagServer.init(defaultConfig);

  return async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    const matchingProtection = protections.find((protection) =>
      protection.paths.some((path) => {
        if (path.endsWith('/*')) {
          const basePath = path.slice(0, -1);
          return pathname.startsWith(basePath);
        }
        return pathname === path;
      }),
    );

    if (!matchingProtection) {
      // No protection matches — still propagate context downstream.
      return withContextHeader(request);
    }

    if (matchingProtection.config) {
      const mergedConfig: BridgeConfig = {
        ...defaultConfig,
        ...matchingProtection.config,
        appId: matchingProtection.config.appId || defaultConfig.appId || '',
      };
      featureFlagServer.init(mergedConfig);
    }

    const isEnabled = await featureFlagServer.isFeatureEnabledServer(
      matchingProtection.flag,
      request,
    );

    if (!isEnabled) {
      const isApi = isApiRequest(request);
      const responseType = matchingProtection.responseType || 'redirect';

      if (isApi || responseType === 'error') {
        const status = matchingProtection.errorStatus || 403;
        const message =
          matchingProtection.errorMessage ||
          `Feature flag "${matchingProtection.flag}" is not enabled`;
        logger.info(`Feature flag "${matchingProtection.flag}" not enabled, returning ${status} error`);
        return NextResponse.json({ error: message }, { status });
      }

      const redirectRoute =
        matchingProtection.redirectTo || defaultConfig.defaultRedirectRoute || '/';
      logger.info(`Feature flag "${matchingProtection.flag}" not enabled, redirecting to ${redirectRoute}`);
      const redirectUrl = new URL(redirectRoute, request.url);
      return NextResponse.redirect(redirectUrl);
    }

    // Flag passed — continue, propagating the eval context downstream.
    return withContextHeader(request);
  };
}

/** Single-flag middleware (paths set by the matcher). Export name kept stable. */
export function withFeatureFlag(flagName: string, options: WithFeatureFlagOptions = {}) {
  return withFeatureFlags([
    {
      flag: flagName,
      paths: ['/'],
      redirectTo: options.config?.redirectRoute,
      config: options.config,
      responseType: options.responseType,
      errorStatus: options.errorStatus,
      errorMessage: options.errorMessage,
    },
  ]);
}

/** Page-route flag guard with redirect. Export name kept stable. */
export function requireFeatureFlag(flagName: string, redirectUrl = '/') {
  return withFeatureFlag(flagName, {
    config: {
      redirectRoute: redirectUrl,
    },
  });
}

/** API-route flag guard returning a JSON error. Export name kept stable. */
export function requireApiFeatureFlag(
  flagName: string,
  options: {
    errorStatus?: number;
    errorMessage?: string;
    config?: Partial<BridgeConfig>;
  } = {},
) {
  return withFeatureFlag(flagName, {
    responseType: 'error',
    errorStatus: options.errorStatus || 403,
    errorMessage: options.errorMessage || `Feature flag "${flagName}" is not enabled`,
    config: options.config,
  });
}

export default requireFeatureFlag;
