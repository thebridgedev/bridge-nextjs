'use client';

import type { AppConfig } from '@nebulr-group/bridge-auth-core';
import { useBridgeStore } from '../../core/bridge-instance';

/**
 * Anonymous app config (SSO providers, signup/magic-link toggles, etc.) —
 * mirrors bridge-svelte's `appConfigStore`.
 *
 * Loaded by `ensureAppConfig()` on bridge bootstrap. Returns `null` until the
 * fetch resolves; SDK auth components await `ensureAppConfig()` directly when
 * they need the value before render.
 */
export function useAppConfig(): AppConfig | null {
  return useBridgeStore((s) => s.appConfig);
}
