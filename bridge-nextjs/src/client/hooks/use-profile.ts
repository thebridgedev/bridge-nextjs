'use client';

import type { Profile } from '@nebulr-group/bridge-auth-core';
import { useCallback } from 'react';
import { getBridgeAuth, useBridgeStore } from '../../core/bridge-instance';
import { logger } from '../../shared/logger';

interface UseProfileReturn {
  /** Current user profile. `undefined` = still loading; `null` = no profile available. */
  profile: Profile | null | undefined;
  /** True while bridge is still loading the profile. */
  isLoading: boolean;
  /** Last profile error message, if any. */
  error: string | null;
  /** Re-fetch the profile from auth-core. */
  updateProfile: () => Promise<Profile | null>;
  /** Whether the current user has completed onboarding. */
  isOnboarded: boolean;
  /** Whether the current user has access to multiple tenants. */
  hasMultiTenantAccess: boolean;
}

/**
 * Reactive profile data, backed by the auth-core singleton.
 *
 * Mirrors bridge-svelte's `profileStore` + the convenience derived stores
 * `isOnboarded` / `hasMultiTenantAccess`. Updates automatically when auth-core
 * fires `auth:profile`, `auth:login`, `auth:logout`, or `auth:workspace-changed`.
 */
export function useProfile(): UseProfileReturn {
  const profile = useBridgeStore((s) => s.profile);
  const isLoading = useBridgeStore((s) => s.isLoading);
  const error = useBridgeStore((s) => s.error);

  const updateProfile = useCallback(async (): Promise<Profile | null> => {
    try {
      const p = await getBridgeAuth().getProfile();
      // The auth-core call updates the store via the auth:profile event;
      // returning here so callers can await the resolved value if needed.
      return p ?? null;
    } catch (err) {
      logger.error('[useProfile] updateProfile failed:', err);
      return null;
    }
  }, []);

  return {
    profile,
    isLoading,
    error,
    updateProfile,
    isOnboarded: profile?.onboarded ?? false,
    hasMultiTenantAccess: profile?.multiTenantAccess ?? false,
  };
}
