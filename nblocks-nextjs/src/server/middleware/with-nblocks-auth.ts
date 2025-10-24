import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from './auth-middleware';

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

export interface WithNblocksAuthOptions {
  /** Route rules for protection */
  rules?: RouteRule[];
  /** 
   * Default access level for routes not matched by any rule
   * @default 'protected' - All unmatched routes require authentication
   * Set to 'public' to allow access to unmatched routes without authentication
   */
  defaultAccess?: 'public' | 'protected';
  /** Custom callback path (defaults to /nblocks/auth/oauth-callback) */
  callbackPath?: string;
  /** 
   * nBlocks App ID (optional - automatically reads from NEXT_PUBLIC_NBLOCKS_APP_ID env var)
   * Only provide this if you need to override the env var
   */
  appId?: string;
  /** 
   * Auth base URL (optional - automatically reads from NEXT_PUBLIC_NBLOCKS_AUTH_BASE_URL env var)
   * Defaults to https://auth.nblocks.cloud
   */
  authBaseUrl?: string;
  /** 
   * Callback URL (optional - automatically reads from NEXT_PUBLIC_NBLOCKS_CALLBACK_URL env var)
   */
  callbackUrl?: string;
  /** 
   * Enable debug logging (optional - automatically reads from NEXT_PUBLIC_NBLOCKS_DEBUG env var)
   * Defaults to false
   */
  debug?: boolean;
}

/**
 * Enhanced middleware helper for nBlocks authentication
 * Automatically reads configuration from environment variables (NEXT_PUBLIC_NBLOCKS_*)
 * 
 * Configuration priority (highest to lowest):
 * 1. Environment variables (recommended)
 * 2. Props passed to this function
 * 3. Default values
 * 
 * @example
 * // Basic usage: Protect all routes except specified public routes
 * // Set NEXT_PUBLIC_NBLOCKS_APP_ID in your .env.local
 * import { withNblocksAuth } from '@nebulr/nblocks-nextjs/server';
 * 
 * export default withNblocksAuth({
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
 * export default withNblocksAuth({
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
 * export default withNblocksAuth({
 *   defaultAccess: 'protected', // All unmatched routes require authentication
 *   rules: [
 *     { match: '/', public: true },
 *     { match: '/login', public: true },
 *   ]
 * });
 * 
 * @example
 * // Alternative: Passing appId directly (still supported)
 * export default withNblocksAuth({
 *   appId: 'YOUR_APP_ID',
 *   defaultAccess: 'protected',
 *   rules: [...]
 * });
 */
export function withNblocksAuth(options: WithNblocksAuthOptions = {}) {
  const {
    rules = [],
    defaultAccess = 'protected',
    callbackPath = '/nblocks/auth/oauth-callback',
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

    // Handle OAuth callback automatically
    if (pathname === callbackPath) {
      return handleOAuthCallback(request);
    }

    // Apply route rules
    for (const rule of rules) {
      if (matchesRule(pathname, rule.match)) {
        // Check feature flag requirements if specified
        if (rule.featureFlag) {
          // TODO: Implement feature flag checking
          // For now, just allow access
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

/**
 * Handle OAuth callback automatically
 */
async function handleOAuthCallback(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get('code');
    
    if (!code) {
      console.error('No authorization code found in callback');
      return NextResponse.redirect(new URL('/?error=no_code', request.url));
    }
    
    // Import the callback handler dynamically to avoid circular dependencies
    const { createNblocksCallbackRoute } = await import('../callback-route');
    const callbackHandler = createNblocksCallbackRoute({
      redirectPath: '/',
      errorRedirectPath: '/?error=auth_failed'
    });
    
    return callbackHandler(request);
  } catch (error) {
    console.error('Error handling OAuth callback:', error);
    return NextResponse.redirect(new URL('/?error=auth_failed', request.url));
  }
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

export default withNblocksAuth;
