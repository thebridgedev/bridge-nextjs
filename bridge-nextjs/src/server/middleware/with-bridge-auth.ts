import { NextRequest, NextResponse } from 'next/server';
import { resolveLoginDestination, unauthenticatedResponse, withAuth } from './auth-middleware';
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
   * In-app login route (optional - automatically reads from
   * NEXT_PUBLIC_BRIDGE_LOGIN_ROUTE). Setting it declares SDK-auth mode: users
   * sign in with the drop-in `<LoginForm />`, their tokens live in the browser,
   * and this middleware becomes non-authoritative for them (see below).
   */
  loginRoute?: string;
  /** 
   * Enable debug logging (optional - automatically reads from NEXT_PUBLIC_BRIDGE_DEBUG env var)
   * Defaults to false
   */
  debug?: boolean;
}

/** The cookie the hosted-login callback writes; the only session middleware can see. */
const SESSION_COOKIE = 'bridge_access_token';

/**
 * Server-side route protection for Bridge.
 * Automatically reads configuration from environment variables (NEXT_PUBLIC_BRIDGE_*)
 *
 * ## Which layer guards what
 *
 * - **This middleware guards hosted-mode sessions.** Hosted login (no
 *   `loginRoute`) stores the session in cookies, which the middleware reads on
 *   every request. A route that requires a session — an unmatched route under
 *   `defaultAccess: 'protected'`, or a rule without `public: true` under
 *   either `defaultAccess` — is enforced: a signed-out page navigation is
 *   redirected to login with the attempted URL remembered, an API request gets
 *   `401`. If the session cannot be checked (an error while deciding), the
 *   request is denied, never let through.
 * - **SDK-auth apps are guarded by `<ProtectedRoute>` and by your API.** When
 *   `loginRoute` is configured (option or NEXT_PUBLIC_BRIDGE_LOGIN_ROUTE),
 *   users sign in with `<LoginForm />` and their tokens live in the browser,
 *   where middleware cannot see them. Redirecting such a request to login would
 *   loop a signed-in user, so when the request carries no Bridge session cookie
 *   the middleware lets it through and is explicitly NOT the guard (it says so
 *   once, in development). When a Bridge session cookie IS present it is
 *   enforced as in hosted mode.
 * - **Neither route guard replaces server-side authorization.** Route guards
 *   decide what the browser is shown; every API route must still verify the
 *   user's token itself.
 *
 * Configuration priority (highest to lowest):
 * 1. Environment variables (recommended)
 * 2. Props passed to this function
 * 3. Default values
 * 
 * @example
 * // Basic usage: Protect all routes except specified public routes
 * // Set NEXT_PUBLIC_BRIDGE_APP_ID in your .env.local
 * import { withBridgeAuth } from '@nebulr-group/bridge-nextjs/server';
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
 * // (enforced for hosted-mode sessions; see "Which layer guards what")
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
    loginRoute,
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
    ...(loginRoute && { loginRoute }),
    ...(debug !== undefined && { debug })
  };
  const overrides = Object.keys(configOverrides).length > 0 ? configOverrides : undefined;

  // TBP-666 — SDK-auth mode is declared by a configured `loginRoute` (the same
  // signal auth-middleware uses to pick the in-app login page). Its sessions
  // live in the browser, invisible to middleware.
  const sdkAuth = !!getConfig(overrides).loginRoute;

  // Create the auth middleware with public paths and config
  const authMiddleware = withAuth({ publicPaths, config: overrides });

  let warnedUnenforced = false;
  function warnUnenforced(pathname: string): void {
    if (warnedUnenforced || process.env.NODE_ENV === 'production') return;
    warnedUnenforced = true;
    logger.warn(
      `[bridge] withBridgeAuth let "${pathname}" through without a session check. This app signs in ` +
        'with SDK auth (loginRoute is set), whose tokens live in the browser where middleware cannot ' +
        'see them, so the middleware is not the guard here. Wrap the page in <ProtectedRoute> and ' +
        'verify the token in your API. (Shown once, in development only.)',
    );
  }

  /** Can this middleware see a Bridge session on the request at all? */
  function sessionVisible(request: NextRequest): boolean {
    return !!request.cookies.get(SESSION_COOKIE)?.value;
  }

  /** Fail closed: the session could not be checked, so the answer is no. */
  function denied(request: NextRequest, err: unknown): NextResponse {
    logger.error('withBridgeAuth - could not verify the session, denying:', err);
    return NextResponse.json(
      { error: 'Unauthorized', message: 'Could not verify the session' },
      { status: 401 },
    );
  }

  /** A route that requires a session. */
  async function requireSession(request: NextRequest): Promise<NextResponse> {
    if (sdkAuth && !sessionVisible(request)) {
      warnUnenforced(request.nextUrl.pathname);
      return NextResponse.next();
    }
    try {
      return await authMiddleware(request);
    } catch (err) {
      return denied(request, err);
    }
  }

  return async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // Let OAuth callback be handled by the App Router route (Node.js runtime).
    // Handling it here would run in Edge and fetch() to stage can fail.
    if (pathname === callbackPath) {
      return NextResponse.next();
    }

    // Apply route rules. A public (or flag) rule decides as soon as it matches;
    // a matching non-public rule is remembered so that it is enforced even
    // under `defaultAccess: 'public'` (TBP-666 — it used to fall through to the
    // default and let the request in).
    let matchedProtected = false;
    for (const rule of rules) {
      if (matchesRule(pathname, rule.match)) {
        // Feature-flag rules require an authenticated user (flags are
        // evaluated against the current user's identity/attributes).
        if (rule.featureFlag) {
          if (sdkAuth && !sessionVisible(request)) {
            warnUnenforced(pathname);
            return NextResponse.next();
          }
          try {
            return await evaluateFeatureFlagRule(request, rule.featureFlag, {
              appId,
              authBaseUrl,
              callbackUrl,
              loginRoute,
              debug,
            });
          } catch (err) {
            return denied(request, err);
          }
        }

        // If route is public, allow access
        if (rule.public) {
          return NextResponse.next();
        }
        matchedProtected = true;
      }
    }

    // Apply default access level
    if (defaultAccess === 'public' && !matchedProtected) {
      return NextResponse.next();
    }

    // Protected: by a matching rule, or by default
    return requireSession(request);
  };
}

/** Options needed to resolve config for server-side flag evaluation. */
interface FeatureFlagConfigOverrides {
  appId?: string;
  authBaseUrl?: string;
  callbackUrl?: string;
  loginRoute?: string;
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
    ...(overrides.loginRoute && { loginRoute: overrides.loginRoute }),
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
    const hostedLoginUrl = authService.createLoginUrl({}, currentOrigin);
    // TBP-629 — the same login destination as any other protected route: the
    // app's `loginRoute` with `?redirectUri=` in SDK mode, the hosted page plus
    // the return-to cookie in hosted mode. This branch used to redirect to the
    // hosted page bare, so a signed-out visitor on a flag-gated deep link lost
    // it (and an SDK-mode app's own login page was skipped).
    const destination = resolveLoginDestination(request, config, hostedLoginUrl);
    return unauthenticatedResponse(request, destination.loginUrl, destination.returnTo);
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
