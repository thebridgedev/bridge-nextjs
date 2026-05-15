'use client';

'use client';

import type { AuthState } from '@nebulr-group/bridge-auth-core';
import { useCallback } from 'react';
import { getBridgeAuth, useBridgeStore } from '../../core/bridge-instance';
import { logger } from '../../shared/logger';

interface UseAuthReturn {
  /** Whether the current user has a valid access token. */
  isAuthenticated: boolean;
  /** True while bridge is still initializing the auth state. */
  isLoading: boolean;
  /** Last auth error message, if any. */
  error: string | null;
  /** Current auth state machine value. */
  authState: AuthState;
  /** Redirect to the hosted bridge login. */
  login: (options?: { redirectUri?: string }) => Promise<void>;
  /** Clear tokens and reset auth state. */
  logout: () => Promise<void>;
  /** Exchange an OAuth callback `code` for tokens. */
  handleCallback: (code: string) => Promise<void>;
}

/**
 * Reactive auth state and actions, backed by the auth-core singleton.
 *
 * Mirrors bridge-svelte's `auth` + `isAuthenticated` + `authState` exports as a
 * single hook return value. Updates automatically when auth-core emits events.
 *
 * @example
 * ```tsx
 * import { useAuth } from '@nebulr-group/bridge-nextjs/client';
 *
 * function Header() {
 *   const { isAuthenticated, login, logout } = useAuth();
 *   return isAuthenticated
 *     ? <button onClick={logout}>Logout</button>
 *     : <button onClick={() => login()}>Login</button>;
 * }
 * ```
 */
export function useAuth(): UseAuthReturn {
  const tokens = useBridgeStore((s) => s.tokens);
  const isLoading = useBridgeStore((s) => s.isLoading);
  const error = useBridgeStore((s) => s.error);
  const authState = useBridgeStore((s) => s.authState);

  const login = useCallback(async (options?: { redirectUri?: string }) => {
    try {
      const bridge = getBridgeAuth();
      const loginUrl = bridge.createLoginUrl(options);
      if (typeof window !== 'undefined') {
        window.location.href = loginUrl;
      }
    } catch (err) {
      logger.error('[useAuth] login failed:', err);
      throw err;
    }
  }, []);

  const logout = useCallback(async () => {
    // auth-core's `logout()` does `window.location.href = createLogoutUrl()` —
    // a hard redirect to bridge-api's hosted logout endpoint, which doesn't fit
    // an SDK-auth flow. Use `clearSession()` to drop tokens locally and reset
    // the bridge store manually so subscribed hooks re-render immediately.
    // (auth-core 0.1.2's logout signature takes no options.)
    try {
      getBridgeAuth().clearSession();
      useBridgeStore.setState({
        tokens: null,
        profile: null,
        flags: {},
        authState: 'unauthenticated',
        tenantUsers: [],
      });
    } catch (err) {
      logger.error('[useAuth] logout failed:', err);
      throw err;
    }
  }, []);

  const handleCallback = useCallback(async (code: string) => {
    if (!code) throw new Error('No authorization code provided');
    try {
      await getBridgeAuth().handleCallback(code);
    } catch (err) {
      logger.error('[useAuth] handleCallback failed:', err);
      throw err;
    }
  }, []);

  return {
    isAuthenticated: !!tokens?.accessToken,
    isLoading,
    error,
    authState,
    login,
    logout,
    handleCallback,
  };
}
