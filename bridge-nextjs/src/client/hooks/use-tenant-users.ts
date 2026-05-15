'use client';

import type { TenantUser } from '@nebulr-group/bridge-auth-core';
import { useBridgeStore } from '../../core/bridge-instance';

/**
 * Tenant users available during multi-tenant selection — mirrors bridge-svelte's `tenantUsersStore`.
 *
 * Populated by auth-core when the auth state transitions to `tenant-selection`.
 * Empty array otherwise.
 */
export function useTenantUsers(): TenantUser[] {
  return useBridgeStore((s) => s.tenantUsers);
}
