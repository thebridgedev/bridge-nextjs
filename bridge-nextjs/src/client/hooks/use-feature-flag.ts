'use client';

import { useEffect, useState } from 'react';
import { logger } from '../../shared/logger';
import { isFeatureEnabled } from '../../shared/services/feature-flag.service';
import { useBridgeConfig } from './use-bridge-config';
import { useBridgeToken } from './use-bridge-token';

interface UseFeatureFlagOptions {
  forceLive?: boolean;
}

const useFeatureFlag = (flagName: string, options: UseFeatureFlagOptions = {}): boolean => {
  const { forceLive = false } = options;
  const [isEnabled, setIsEnabled] = useState<boolean>(false);
  const config = useBridgeConfig();
  const { getAccessToken, isAuthenticated } = useBridgeToken();

  useEffect(() => {
    const checkFeatureFlag = async () => {
      try {
        const accessToken = getAccessToken();
        
        if (!accessToken) {
          setIsEnabled(false);
          return;
        }
        
        if (!config.appId) {
          logger.error('appId is required for feature flag checking');
          setIsEnabled(false);
          return;
        }

        const enabled = await isFeatureEnabled(
          flagName,
          config.appId,
          accessToken,
          forceLive,
          config.cloudViewsUrl
        );
        setIsEnabled(enabled);
      } catch (error) {
        logger.error(`Failed to check feature flag ${flagName}:`, error);
        setIsEnabled(false);
      }
    };

    checkFeatureFlag();
  }, [flagName, config.appId, getAccessToken, isAuthenticated, forceLive]);

  return isEnabled;
};

export default useFeatureFlag; 