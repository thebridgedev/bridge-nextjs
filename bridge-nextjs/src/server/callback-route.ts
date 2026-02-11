import { NextRequest, NextResponse } from 'next/server';
import { logger, setDebug } from '../shared/logger';
import { getConfig } from './utils/get-config';
import { initServices } from './utils/init-services';

export interface CallbackRouteOptions {
  redirectPath?: string;
  errorRedirectPath?: string;
  /** Query param names to preserve on success redirect (e.g. payment). Default: ['payment'] */
  preserveQueryParams?: string[];
}

/**
 * Creates a Next.js route handler for OAuth callback
 * 
 * @param options Configuration options for the callback route
 * @returns A Next.js route handler function
 * 
 * @example
 * // In your app/auth/callback/route.ts
 * import { createCallbackRoute } from 'bridge-nextjs/server';
 * 
 * export const GET = createCallbackRoute({
 *   redirectPath: '/dashboard', // Optional: redirect to a different path after login
 *   errorRedirectPath: '/login?error=auth_failed' // Optional: custom error redirect
 * });
 */
export function createBridgeCallbackRoute(options: CallbackRouteOptions = {}) {
  const preserveParams = options.preserveQueryParams ?? ['payment'];

  return async function GET(request: NextRequest) {
    const config = getConfig();
    setDebug(!!config.debug);

    try {
      logger.debug('createBridgeCallbackRoute: Starting callback route');
      const searchParams = request.nextUrl.searchParams;
      const code = searchParams.get('code');

      if (!code) {
        logger.error('No authorization code found in callback');
        const errorPath = options.errorRedirectPath || '/?error=no_code';
        return NextResponse.redirect(new URL(errorPath, request.url));
      }

      // Initialize services with the configuration
      const { authService } = await initServices(config);

      const redirectPath = options.redirectPath || '/';
      const redirectUrl = new URL(redirectPath, request.url);
      for (const name of preserveParams) {
        const value = searchParams.get(name);
        if (value != null) redirectUrl.searchParams.set(name, value);
      }
      const response = NextResponse.redirect(redirectUrl);
      await authService.handleCallbackServer(code, response);

      return response;
    } catch (error) {
      logger.error('Error handling callback:', error);
      const errorPath = options.errorRedirectPath || '/?error=auth_failed';
      return NextResponse.redirect(new URL(errorPath, request.url));
    }
  };
} 