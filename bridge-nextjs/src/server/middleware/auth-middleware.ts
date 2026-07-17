import { NextRequest, NextResponse } from 'next/server';
import { BridgeConfig } from '../../shared/types/config';
import { getConfig } from '../utils/get-config';
import { initServices } from '../utils/init-services';
import { isApiRequest } from '../utils/is-api-request';

/**
 * Denial response for an unauthenticated request.
 *
 * - API/data requests get a `401` JSON body (never a redirect — a redirect to
 *   an HTML login page is useless to a fetch/XHR caller).
 * - Page navigations are redirected to the Bridge login URL.
 */
function unauthenticatedResponse(
  request: NextRequest,
  loginUrl: string,
): NextResponse {
  if (isApiRequest(request)) {
    return NextResponse.json(
      { error: 'Unauthorized', message: 'Authentication required' },
      { status: 401 },
    );
  }
  return NextResponse.redirect(loginUrl);
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
      const loginUrl = authService.createLoginUrl({}, currentOrigin);
      return unauthenticatedResponse(request, loginUrl);
    }

    // Get the access token for logging purposes
    const cookieString = request.headers.get('cookie') || '';
    const accessToken = tokenService.getAccessTokenServer(cookieString);

    if (!accessToken) {
      // Unauthenticated: API routes get 401 JSON, page navigations redirect to login.
      const currentOrigin = new URL(request.url).origin;
      const loginUrl = authService.createLoginUrl({}, currentOrigin);
      return unauthenticatedResponse(request, loginUrl);
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