'use client';

import { useCallback } from 'react';
import { redirectToPlanSelection } from '../../shared/services/plan.service';
import { useBridgeConfig } from './use-bridge-config';
import { useBridgeToken } from './use-bridge-token';

/**
 * Hook that returns planService.redirectToPlanSelection() bound to current config and token.
 * Redirects the user to Bridge's plan selection page (handover protocol).
 *
 * @example
 * const { redirectToPlanSelection } = usePlanService();
 * <button onClick={() => redirectToPlanSelection()}>Choose plan</button>
 */
export function usePlanService() {
  const config = useBridgeConfig();
  const { getAccessToken } = useBridgeToken();

  const redirectToPlanSelectionBound = useCallback(async () => {
    const accessToken = getAccessToken();
    if (!accessToken) {
      throw new Error('No access token available. Please log in first.');
    }
    await redirectToPlanSelection(config, accessToken);
  }, [config, getAccessToken]);

  return {
    redirectToPlanSelection: redirectToPlanSelectionBound,
  };
}
