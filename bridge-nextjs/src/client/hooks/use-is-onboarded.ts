'use client';

import { useBridgeStore } from '../../core/bridge-instance';

/** Whether the current user has completed onboarding — mirrors bridge-svelte's `isOnboarded`. */
export function useIsOnboarded(): boolean {
  return useBridgeStore((s) => s.profile?.onboarded ?? false);
}
