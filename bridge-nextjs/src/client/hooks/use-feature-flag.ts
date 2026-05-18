'use client';

import { useEffect, useState } from 'react';
import { useBridgeStore } from '../../core/bridge-instance';
import { isFeatureEnabled } from '../../shared/feature-flag';
import { logger } from '../../shared/logger';

interface UseFeatureFlagOptions {
  forceLive?: boolean;
}

/**
 * Reactive feature flag check — mirrors bridge-svelte's `<FeatureFlag>` evaluation.
 *
 * Returns `false` until the flag is fetched. Re-runs when auth state changes
 * (login, token refresh, workspace switch) so flags reflect the current user.
 *
 * `forceLive: true` bypasses auth-core's cache.
 */
const useFeatureFlag = (
  flagName: string,
  options: UseFeatureFlagOptions = {}
): boolean => {
  const { forceLive = false } = options;
  const tokens = useBridgeStore((s) => s.tokens);
  const ready = useBridgeStore((s) => s.ready);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (!ready) return;
    let mounted = true;
    (async () => {
      try {
        const result = await isFeatureEnabled(flagName, forceLive);
        if (mounted) setEnabled(result);
      } catch (err) {
        logger.error(`[useFeatureFlag] flag "${flagName}" failed:`, err);
        if (mounted) setEnabled(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [flagName, forceLive, ready, tokens?.accessToken]);

  return enabled;
};

export default useFeatureFlag;
