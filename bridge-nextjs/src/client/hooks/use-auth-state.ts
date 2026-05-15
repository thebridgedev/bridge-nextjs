'use client';

import type { AuthState } from '@nebulr-group/bridge-auth-core';
import { useBridgeStore } from '../../core/bridge-instance';

/**
 * Current auth state machine value — mirrors bridge-svelte's `authState`.
 *
 * Possible values: `'unauthenticated' | 'authenticating' | 'mfa-required' |
 * 'tenant-selection' | 'authenticated'` (see auth-core for the canonical list).
 */
export function useAuthState(): AuthState {
  return useBridgeStore((s) => s.authState);
}
