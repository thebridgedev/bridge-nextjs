'use client';

import { useBridgeStore } from '../../core/bridge-instance';

/**
 * Feature flag map (`{ [flagName]: boolean }`) — mirrors bridge-svelte's `flagsStore`.
 *
 * Note: the existing `useFeatureFlag(flagName)` hook reads from the legacy
 * `feature-flag.service` cache. This new hook reads from the auth-core-backed
 * store. Once the team-feature port lands and feature flags are migrated to
 * auth-core, the legacy hook becomes redundant.
 */
export function useFlagsStore(): Record<string, boolean> {
  return useBridgeStore((s) => s.flags);
}
