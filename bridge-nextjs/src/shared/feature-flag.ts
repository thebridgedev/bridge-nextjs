// Thin wrapper around auth-core's feature-flag API — mirrors
// bridge-svelte/src/lib/shared/feature-flag.ts so the surface stays in sync.
//
// `loadFeatureFlags` populates the bridge store's `flags` map; `isFeatureEnabled`
// performs a single-flag check (cached unless `forceLive: true`).

import { getBridgeAuth, useBridgeStore } from '../core/bridge-instance';

export async function loadFeatureFlags(): Promise<void> {
  const flags = await getBridgeAuth().loadFeatureFlags();
  useBridgeStore.setState({ flags });
}

export async function isFeatureEnabled(
  flag: string,
  forceLive = false
): Promise<boolean> {
  return getBridgeAuth().isFeatureEnabled(flag, { forceLive });
}

export const featureFlags = {
  flags: () => useBridgeStore.getState().flags,
  refresh: loadFeatureFlags,
};
