import { NextRequest, NextResponse } from 'next/server';
import { getConfig } from './utils/get-config';
import { initServices } from './utils/init-services';

export interface CallbackRouteOptions {
  redirectPath?: string;
  errorRedirectPath?: string;
}

/**
 * Creates a Next.js route handler for OAuth callback
 * 
 * @param options Configuration options for the callback route
 * @returns A Next.js route handler function
 * 
 * @example
 * // In your app/auth/callback/route.ts
 * import { createCallbackRoute } from 'nblocks-nextjs/server';
 * 
 * export const GET = createCallbackRoute({
 *   redirectPath: '/dashboard', // Optional: redirect to a different path after login
 *   errorRedirectPath: '/login?error=auth_failed' // Optional: custom error redirect
 * });
 */
export function createNblocksCallbackRoute(options: CallbackRouteOptions = {}) {
  return async function GET(request: NextRequest) {
    try {
      console.log('🔑 createNblocksCallbackRoute: Starting callback route');
      const searchParams = request.nextUrl.searchParams;
      const code = searchParams.get('code');
      
      if (!code) {
        console.error('No authorization code found in callback');
        const errorPath = options.errorRedirectPath || '/?error=no_code';
        return NextResponse.redirect(new URL(errorPath, request.url));
      }
      
      // Get the configuration from environment variables
      const config = getConfig();      
      
      // Initialize services with the configuration
      const { authService } = await initServices(config);
      
      const redirectPath = options.redirectPath || '/';
      const response = NextResponse.redirect(new URL(redirectPath, request.url));
      await authService.handleCallbackServer(code, response);
      
      return response;
    } catch (error) {
      console.error('Error handling callback:', error);
      const errorPath = options.errorRedirectPath || '/?error=auth_failed';
      return NextResponse.redirect(new URL(errorPath, request.url));
    }
  };
} 