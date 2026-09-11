import { NextRequest, NextResponse } from 'next/server';
import { logger, setDebug } from '../shared/logger';
import { getConfig } from './utils/get-config';
import { initServices } from './utils/init-services';
import { clearReturnToCookie, readReturnToCookie } from './utils/return-to';

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

      // TBP-629 — restore the deep link the middleware stashed before it sent
      // this visitor to the hosted portal. Null when nothing was stashed, so an
      // app with no deep linking lands on `redirectPath` exactly as it always
      // did. `preserveParams` (today: `payment`) wins: it signals a
      // just-completed checkout whose landing page the billing flow owns, and
      // that is a deliberate destination rather than a remembered one.
      const stashedReturnTo = readReturnToCookie(request);
      const carriedParams = preserveParams.filter((name) => searchParams.get(name) != null);

      const redirectPath =
        carriedParams.length === 0 && stashedReturnTo
          ? stashedReturnTo
          : options.redirectPath || '/';
      const redirectUrl = new URL(redirectPath, request.url);
      for (const name of carriedParams) {
        redirectUrl.searchParams.set(name, searchParams.get(name)!);
      }
      const response = NextResponse.redirect(redirectUrl);
      // One-shot: a value left behind would hijack the next login in this
      // browser. Cleared whether or not it was used.
      clearReturnToCookie(response);
      await authService.handleCallbackServer(code, response);

      return response;
    } catch (error) {
      logger.error('Error handling callback:', error);
      const errorPath = options.errorRedirectPath || '/?error=auth_failed';
      return NextResponse.redirect(new URL(errorPath, request.url));
    }
  };
} 