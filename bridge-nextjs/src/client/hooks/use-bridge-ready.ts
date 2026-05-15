'use client';

import { useBridgeStore } from '../../core/bridge-instance';

/**
 * Whether the bridge bootstrap layer has finished initializing —
 * mirrors bridge-svelte's `bridgeReadyStore`.
 *
 * Becomes `true` once `<BridgeProvider>` has finished its bootstrap effect.
 * Use this to gate rendering UI that depends on auth-core being available.
 */
export function useBridgeReady(): boolean {
  return useBridgeStore((s) => s.ready);
}
