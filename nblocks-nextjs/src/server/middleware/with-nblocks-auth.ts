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
  /** Default access level for unmatched routes */
  defaultAccess?: 'public' | 'protected';
  /** Custom callback path (defaults to /nblocks/auth/oauth-callback) */
  callbackPath?: string;
}

/**
 * Enhanced middleware helper for nBlocks authentication
 * Provides bridge-svelte style route configuration
 * 
 * @example
 * // middleware.ts
 * import { withNblocksAuth } from '@nebulr/nblocks-nextjs/server';
 * 
 * export default withNblocksAuth({
 *   rules: [
 *     { match: '/', public: true },
 *     { match: '/login', public: true },
 *     { match: '/nblocks/auth/oauth-callback', public: true },
 *     // All other routes are protected by default
 *   ]
 * });
 */
export function withNblocksAuth(options: WithNblocksAuthOptions = {}) {
  const {
    rules = [],
    defaultAccess = 'protected',
    callbackPath = '/nblocks/auth/oauth-callback'
  } = options;

  // Extract public paths from rules
  const publicPaths = rules
    .filter(rule => rule.public === true)
    .map(rule => rule.match.toString());

  // Add the callback path as public by default
  if (!publicPaths.includes(callbackPath)) {
    publicPaths.push(callbackPath);
  }

  // Create the auth middleware with public paths
  const authMiddleware = withAuth({
    publicPaths
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
