'use client';

import { useBridgeStore } from '../../core/bridge-instance';

/** Whether the current user has access to multiple tenants — mirrors bridge-svelte's `hasMultiTenantAccess`. */
export function useHasMultiTenantAccess(): boolean {
  return useBridgeStore((s) => s.profile?.multiTenantAccess ?? false);
}
