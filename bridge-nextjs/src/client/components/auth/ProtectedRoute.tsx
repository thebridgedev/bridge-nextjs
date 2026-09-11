'use client';

import { useRouter } from 'next/navigation';
import { ReactNode, useEffect } from 'react';
import { withReturnTo } from '@nebulr-group/bridge-auth-core';
import { useAuth } from '../../../client/hooks/use-auth';
import { getBridgeAuth, getBridgeConfig } from '../../../core/bridge-instance';

interface ProtectedRouteProps {
  children: ReactNode;
  redirectTo?: string;
}

/**
 * The full path+query the visitor is on, or null outside the browser.
 *
 * Query is part of the deep link for plenty of routes — an exported-file link
 * that loses its `?key=` is as broken as one that loses its path.
 */
function currentAttemptedPath(): string | null {
  if (typeof window === 'undefined') return null;
  return `${window.location.pathname}${window.location.search}`;
}

/**
 * A component that protects routes from unauthenticated access.
 * If the user is not authenticated, they will be redirected to the specified redirectTo path.
 * 
 * @example
 * ```tsx
 * <ProtectedRoute redirectTo="/login">
 *   <YourProtectedComponent />
 * </ProtectedRoute>
 * ```
 */
export function ProtectedRoute({ 
  children, 
  redirectTo = '/' 
}: ProtectedRouteProps) {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      // TBP-629 — carry the page they actually asked for, so a deep link does
      // not collapse to `redirectTo`. The validation and the exclusion rules are
      // auth-core's; `withReturnTo` returns `redirectTo` untouched when there is
      // nothing safe to carry, so an app with no deep linking is unaffected.
      let returnTo: string | null = null;
      let param: string | undefined;
      try {
        const config = getBridgeConfig();
        if (config.returnTo?.enabled !== false) {
          param = config.returnTo?.param;
          // `defaultAccess: 'protected'` with no rules is the truthful
          // description of this component's model: <ProtectedRoute> wraps what
          // it protects, so any path reaching here was protected by
          // construction.
          returnTo = getBridgeAuth()
            .createRouteGuard({
              rules: [],
              defaultAccess: 'protected',
              returnTo: {
                ...config.returnTo,
                loginRoute: config.returnTo?.loginRoute ?? config.loginRoute ?? redirectTo,
              },
            })
            .resolveReturnTo(currentAttemptedPath());
        }
      } catch {
        // Bridge not initialised — losing a deep link is the bug being fixed
        // here; blocking a login would be worse.
      }
      router.push(withReturnTo(redirectTo, returnTo, param));
    }
  }, [isAuthenticated, isLoading, router, redirectTo]);

  // Show loading state while checking authentication
  if (isLoading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh' 
      }}>
        <p>Loading...</p>
      </div>
    );
  }

  // If not authenticated, don't render anything (will redirect)
  if (!isAuthenticated) {
    return null;
  }

  // Render the protected content
  return <>{children}</>;
} 