'use client';

import type { TokenSet } from '@nebulr-group/bridge-auth-core';
import { useBridgeStore } from '../../core/bridge-instance';

/**
 * Live token set from auth-core — mirrors bridge-svelte's `tokenStore`.
 *
 * Returns `null` when unauthenticated. Updates automatically on login/logout/
 * token-refresh via auth-core events.
 *
 * Note: named `useBridgeTokens` (not `useTokenStore`) to avoid colliding with
 * the legacy `useTokenStore` Zustand export in `shared/services/token.service.ts`.
 * Once the legacy service layer is removed, this can be renamed.
 */
export function useBridgeTokens(): TokenSet | null {
  return useBridgeStore((s) => s.tokens);
}
