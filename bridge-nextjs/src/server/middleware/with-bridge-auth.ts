import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from './auth-middleware';
import { FeatureFlagServer } from '../utils/feature-flag.server';
import { getConfig } from '../utils/get-config';
import { isApiRequest } from '../utils/is-api-request';
import { TokenServiceServer } from '../utils/token-service.server';
import { AuthService } from '../../shared/services/auth.service';
import { logger } from '../../shared/logger';

export interface RouteRule {
  /** Path pattern to match (string or RegExp) */
  match: string | RegExp;
  /** Whether this route is public (no auth required) */
  public?: boolean;
  /** Feature flag requirement for this route */
  featureFlag?: string | { any: string[] } | { all: string[] };
  /** Redirect path when feature flag requirement fails */
  redirectTo?: string;
}

export interface WithBridgeAuthOptions {
  /** Route rules for protection */
  rules?: RouteRule[];
  /** 
   * Default access level for routes not matched by any rule
   * @default 'protected' - All unmatched routes require authentication
   * Set to 'public' to allow access to unmatched routes without authentication
   */
  defaultAccess?: 'public' | 'protected';
  /** Custom callback path (defaults to /auth/oauth-callback) */
  callbackPath?: string;
  /** 
   * bridge App ID (optional - automatically reads from NEXT_PUBLIC_BRIDGE_APP_ID env var)
   * Only provide this if you need to override the env var
   */
  appId?: string;
  /** 
   * Auth base URL (optional - automatically reads from NEXT_PUBLIC_BRIDGE_AUTH_BASE_URL env var)
   * Defaults to https://api.thebridge.dev/auth
   */
  authBaseUrl?: string;
  /** 
   * Callback URL (optional - automatically reads from NEXT_PUBLIC_BRIDGE_CALLBACK_URL env var)
   */
  callbackUrl?: string;
  /** 
   * Enable debug logging (optional - automatically reads from NEXT_PUBLIC_BRIDGE_DEBUG env var)
   * Defaults to false
   */
  debug?: boolean;
}

/**
 * Enhanced middleware helper for bridge authentication
 * Automatically reads configuration from environment variables (NEXT_PUBLIC_BRIDGE_*)
 * 
 * Configuration priority (highest to lowest):
 * 1. Environment variables (recommended)
 * 2. Props passed to this function
 * 3. Default values
 * 
 * @example
 * // Basic usage: Protect all routes except specified public routes
 * // Set NEXT_PUBLIC_BRIDGE_APP_ID in your .env.local
 * import { withBridgeAuth } from '@nebulr/bridge-nextjs/server';
 * 
 * export default withBridgeAuth({
 *   rules: [
 *     { match: '/', public: true },
 *     { match: '/login', public: true },
 *     { match: '/about', public: true },
 *     // All other routes are protected by default (defaultAccess: 'protected')
 *   ]
 * });
 * 
 * @example
 * // Make all routes public by default, only protect specific routes
 * export default withBridgeAuth({
 *   defaultAccess: 'public', // All unmatched routes are public
 *   rules: [
 *     { match: '/dashboard', public: false },
 *     { match: '/profile', public: false },
 *     // All other routes are public
 *   ]
 * });
 * 
 * @example
 * // Explicit defaultAccess: 'protected' (this is the default behavior)
 * export default withBridgeAuth({
 *   defaultAccess: 'protected', // All unmatched routes require authentication
 *   rules: [
 *     { match: '/', public: true },
 *     { match: '/login', public: true },
 *   ]
 * });
 * 
 * @example
 * // Alternative: Passing appId directly (still supported)
 * export default withBridgeAuth({
 *   appId: 'YOUR_APP_ID',
 *   defaultAccess: 'protected',
 *   rules: [...]
 * });
 */
export function withBridgeAuth(options: WithBridgeAuthOptions = {}) {
  const {
    rules = [],
    defaultAccess = 'protected',
    callbackPath = '/auth/oauth-callback',
    appId,
    authBaseUrl,
    callbackUrl,
    debug
  } = options;

  // Extract public paths from rules
  const publicPaths = rules
    .filter(rule => rule.public === true)
    .map(rule => rule.match.toString());

  // Add the callback path as public by default
  if (!publicPaths.includes(callbackPath)) {
    publicPaths.push(callbackPath);
  }

  // Build config object from options
  const configOverrides = {
    ...(appId && { appId }),
    ...(authBaseUrl && { authBaseUrl }),
    ...(callbackUrl && { callbackUrl }),
    ...(debug !== undefined && { debug })
  };

  // Create the auth middleware with public paths and config
  const authMiddleware = withAuth({
    publicPaths,
    config: Object.keys(configOverrides).length > 0 ? configOverrides : undefined
  });

  return async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // Let OAuth callback be handled by the App Router route (Node.js runtime).
    // Handling it here would run in Edge and fetch() to stage can fail.
    if (pathname === callbackPath) {
      return NextResponse.next();
    }

    // Apply route rules
    for (const rule of rules) {
      if (matchesRule(pathname, rule.match)) {
        // Feature-flag rules require an authenticated user (flags are
        // evaluated against the current user's identity/attributes).
        if (rule.featureFlag) {
          return evaluateFeatureFlagRule(request, rule.featureFlag, {
            appId,
            authBaseUrl,
            callbackUrl,
            debug,
          });
        }

        // If route is public, allow access
        if (rule.public) {
          return NextResponse.next();
        }
      }
    }

    // Apply default access level
    if (defaultAccess === 'public') {
      return NextResponse.next();
    }

    // Use the auth middleware for protected routes
    return authMiddleware(request);
  };
}

/** Options needed to resolve config for server-side flag evaluation. */
interface FeatureFlagConfigOverrides {
  appId?: string;
  authBaseUrl?: string;
  callbackUrl?: string;
  debug?: boolean;
}

/**
 * Evaluate a route's `featureFlag` requirement for the current user.
 *
 * Semantics (locked, TBP-473):
 *   - Feature-flag evaluation is per-user, so the request must be authenticated
 *     first. Unauthenticated ⇒ 401 JSON for API routes, redirect-to-login for
 *     page navigations.
 *   - Flag denial ⇒ **403 JSON**, never a redirect.
 *   - Fail-closed: any error evaluating the flag ⇒ **403** (deny).
 *
 * Supported requirement shapes:
 *   - `"key"`          — the single flag must be enabled.
 *   - `{ any: [...] }` — at least one of the flags must be enabled.
 *   - `{ all: [...] }` — every flag must be enabled.
 */
async function evaluateFeatureFlagRule(
  request: NextRequest,
  requirement: string | { any: string[] } | { all: string[] },
  overrides: FeatureFlagConfigOverrides,
): Promise<NextResponse> {
  const configOverrides = {
    ...(overrides.appId && { appId: overrides.appId }),
    ...(overrides.authBaseUrl && { authBaseUrl: overrides.authBaseUrl }),
    ...(overrides.callbackUrl && { callbackUrl: overrides.callbackUrl }),
    ...(overrides.debug !== undefined && { debug: overrides.debug }),
  };
  const config = getConfig(
    Object.keys(configOverrides).length > 0 ? configOverrides : undefined,
  );

  // Flags are evaluated for the current user — require authentication first.
  const tokenService = TokenServiceServer.getInstance();
  tokenService.init(config);
  const isAuthenticated = await tokenService.isAuthenticatedServer(request);

  if (!isAuthenticated) {
    if (isApiRequest(request)) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Authentication required' },
        { status: 401 },
      );
    }
    const authService = AuthService.getInstance();
    authService.init(config);
    const currentOrigin = new URL(request.url).origin;
    const loginUrl = authService.createLoginUrl({}, currentOrigin);
    return NextResponse.redirect(loginUrl);
  }

  const featureFlagServer = FeatureFlagServer.getInstance();
  featureFlagServer.init(config);

  let allowed: boolean;
  try {
    allowed = await isFeatureFlagRequirementMet(
      featureFlagServer,
      request,
      requirement,
    );
  } catch (error) {
    // Fail-closed: if the flag cannot be evaluated, deny.
    logger.error('withBridgeAuth - feature flag evaluation failed, denying:', error);
    allowed = false;
  }

  if (!allowed) {
    return NextResponse.json(
      {
        error: 'Forbidden',
        message: 'You do not have access to this resource',
      },
      { status: 403 },
    );
  }

  return NextResponse.next();
}

/**
 * Resolve whether a feature-flag requirement is met for the current request.
 * Evaluates each referenced flag server-side against the user's context via
 * `FeatureFlagServer.isFeatureEnabledServer`.
 */
async function isFeatureFlagRequirementMet(
  featureFlagServer: FeatureFlagServer,
  request: NextRequest,
  requirement: string | { any: string[] } | { all: string[] },
): Promise<boolean> {
  if (typeof requirement === 'string') {
    return featureFlagServer.isFeatureEnabledServer(requirement, request);
  }

  if ('all' in requirement) {
    const keys = requirement.all;
    if (keys.length === 0) return true;
    const results = await Promise.all(
      keys.map((key) => featureFlagServer.isFeatureEnabledServer(key, request)),
    );
    return results.every(Boolean);
  }

  if ('any' in requirement) {
    const keys = requirement.any;
    // An empty `any` set means "no flag can satisfy this" — deny (fail-closed).
    if (keys.length === 0) return false;
    const results = await Promise.all(
      keys.map((key) => featureFlagServer.isFeatureEnabledServer(key, request)),
    );
    return results.some(Boolean);
  }

  // Unknown requirement shape — fail-closed.
  return false;
}

/**
 * Check if a pathname matches a rule pattern
 */
function matchesRule(pathname: string, pattern: string | RegExp): boolean {
  if (typeof pattern === 'string') {
    // Exact match or prefix match
    return pathname === pattern || pathname.startsWith(pattern + '/');
  }
  
  if (pattern instanceof RegExp) {
    return pattern.test(pathname);
  }
  
  return false;
}

export default withBridgeAuth;
