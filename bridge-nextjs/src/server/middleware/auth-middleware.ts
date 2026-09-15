import { NextRequest, NextResponse } from 'next/server';
import { sanitizeReturnTo, withReturnTo } from '@nebulr-group/bridge-auth-core';
import { BridgeConfig } from '../../shared/types/config';
import { getConfig } from '../utils/get-config';
import { initServices } from '../utils/init-services';
import { isApiRequest } from '../utils/is-api-request';
import { stashReturnToCookie } from '../utils/return-to';

/**
 * Denial response for an unauthenticated request.
 *
 * - API/data requests get a `401` JSON body (never a redirect — a redirect to
 *   an HTML login page is useless to a fetch/XHR caller).
 * - Page navigations are redirected to the Bridge login URL.
 */
export function unauthenticatedResponse(
  request: NextRequest,
  loginUrl: string,
  returnTo?: string | null,
): NextResponse {
  if (isApiRequest(request)) {
    return NextResponse.json(
      { error: 'Unauthorized', message: 'Authentication required' },
      { status: 401 },
    );
  }
  // TBP-629 — a redirect to login that forgets where the visitor was heading
  // silently collapses every deep link onto the app's default route.
  const response = NextResponse.redirect(loginUrl);
  stashReturnToCookie(response, returnTo, request.url);
  return response;
}

/**
 * Where to send an unauthenticated page navigation, and what to remember.
 *
 * Two shapes, and the difference is forced rather than stylistic:
 *
 * - **SDK mode** (`loginRoute` configured): the login page is the app's own, so
 *   the target rides as a query parameter it can read. Visible, debuggable, and
 *   it survives a cross-tab click.
 * - **Hosted mode**: the target CANNOT ride on the URL. `createLoginUrl()` feeds
 *   `redirectUri` to the OAuth authorize call and bridge-api validates it with an
 *   exact `allowedRedirectUris.includes()` match, so appending a query would
 *   break login rather than improve it. It goes in a cookie instead, and
 *   `createBridgeCallbackRoute` consumes it when the round-trip lands.
 */
export function resolveLoginDestination(
  request: NextRequest,
  config: BridgeConfig,
  hostedLoginUrl: string,
): { loginUrl: string; returnTo: string | null } {
  if (config.returnTo?.enabled === false) {
    return {
      loginUrl: config.loginRoute
        ? new URL(config.loginRoute, request.url).toString()
        : hostedLoginUrl,
      returnTo: null,
    };
  }

  const { pathname, search } = request.nextUrl;
  let returnTo = sanitizeReturnTo(`${pathname}${search}`);

  // Never let the login route become its own destination — that either loops or
  // strands the visitor on a page that immediately bounces them.
  const loginRoute = config.returnTo?.loginRoute ?? config.loginRoute;
  if (returnTo && loginRoute && returnTo.split('?')[0] === loginRoute.split('?')[0]) {
    returnTo = null;
  }

  if (config.loginRoute) {
    // Resolved against the request origin: `NextResponse.redirect` rejects a
    // relative URL outright ("Invalid URL"), and `loginRoute` is an in-app path
    // by definition. The hosted branch below is already absolute.
    const target = withReturnTo(config.loginRoute, returnTo, config.returnTo?.param);
    return {
      loginUrl: new URL(target, request.url).toString(),
      // Already on the URL; a cookie as well would be a second source of truth.
      returnTo: null,
    };
  }
  return { loginUrl: hostedLoginUrl, returnTo };
}

export interface WithAuthOptions {
  publicPaths?: string[];
  config?: Partial<BridgeConfig>;
}

export function withAuth(options: WithAuthOptions = {}) {
  const {
    publicPaths = ['/login', '/auth/oauth-callback'],
    config: configOverrides
  } = options;
  
  return async function middleware(request: NextRequest) {
    // Initialize services using initServices with config overrides
    const mergedConfig = configOverrides ? getConfig(configOverrides) : undefined;
    const { tokenService, authService, config } = await initServices(mergedConfig);
    
    const { pathname } = request.nextUrl;
    
    // Allow public paths
    const isPublicPath = publicPaths.some(path => {
      // Exact match
      if (pathname === path) return true;
      
      // Subpath match (but not just a prefix match)
      if (pathname.startsWith(path + '/')) return true;
      
      return false;
    });
    
    if (isPublicPath) {
      return NextResponse.next();
    }
    
    // Check if user is authenticated using TokenServiceServer
    const isAuthenticated = await tokenService.isAuthenticatedServer(request);
    
    if (!isAuthenticated) {
      // Unauthenticated: API routes get 401 JSON, page navigations redirect to login.
      const currentOrigin = new URL(request.url).origin;
      const hostedLoginUrl = authService.createLoginUrl({}, currentOrigin);
      const destination = resolveLoginDestination(request, config, hostedLoginUrl);
      return unauthenticatedResponse(request, destination.loginUrl, destination.returnTo);
    }

    // Get the access token for logging purposes
    const cookieString = request.headers.get('cookie') || '';
    const accessToken = tokenService.getAccessTokenServer(cookieString);

    if (!accessToken) {
      // Unauthenticated: API routes get 401 JSON, page navigations redirect to login.
      const currentOrigin = new URL(request.url).origin;
      const hostedLoginUrl = authService.createLoginUrl({}, currentOrigin);
      const destination = resolveLoginDestination(request, config, hostedLoginUrl);
      return unauthenticatedResponse(request, destination.loginUrl, destination.returnTo);
    }
    
    // Create a response object to potentially set new cookies
    const response = NextResponse.next();
    
    // Get token expiry time for logging
    const expiryTime = tokenService.getTokenExpiryTime(accessToken);
    if (expiryTime) {
      const timeUntilExpiry = expiryTime - Date.now();
      const formattedTime = tokenService.formatTimeUntilExpiry(timeUntilExpiry);
      
    }
    
    // Check if token is expiring soon and refresh if needed
    const refreshed = await tokenService.refreshTokenIfNeeded(request, response);
    
    if (refreshed) {            
      // Log the new token expiry time only if debug is enabled
      if (config.debug) {
        const newAccessToken = response.cookies.get('bridge_access_token')?.value;
        if (newAccessToken) {
          const newExpiryTime = tokenService.getTokenExpiryTime(newAccessToken);
          if (newExpiryTime) {
            const newTimeUntilExpiry = newExpiryTime - Date.now();
            const newFormattedTime = tokenService.formatTimeUntilExpiry(newTimeUntilExpiry);
            console.info(`🔄 Auth Middleware - Token refreshed. New token expires in ${newFormattedTime}`);
          }
        }
      }
    }
    
    return response;
  };
}

export default withAuth(); 