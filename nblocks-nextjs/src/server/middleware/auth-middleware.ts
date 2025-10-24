import { NextRequest, NextResponse } from 'next/server';
import { NblocksConfig } from '../../shared/types/config';
import { getConfig } from '../utils/get-config';
import { initServices } from '../utils/init-services';

export interface WithAuthOptions {
  publicPaths?: string[];
  config?: Partial<NblocksConfig>;
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
      // Redirect to nBlocks login URL using AuthService
      const currentOrigin = new URL(request.url).origin;
      const loginUrl = authService.createLoginUrl({}, currentOrigin);
      return NextResponse.redirect(loginUrl);
    }
    
    // Get the access token for logging purposes
    const cookieString = request.headers.get('cookie') || '';
    const accessToken = tokenService.getAccessTokenServer(cookieString);
    
    if (!accessToken) {
      // Redirect to nBlocks login URL using AuthService
      const currentOrigin = new URL(request.url).origin;
      const loginUrl = authService.createLoginUrl({}, currentOrigin);
      return NextResponse.redirect(loginUrl);
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
        const newAccessToken = response.cookies.get('nblocks_access_token')?.value;
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