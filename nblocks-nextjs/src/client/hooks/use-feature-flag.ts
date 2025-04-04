import { useEffect, useState } from 'react';
import { isFeatureEnabled } from '../../shared/services/feature-flag.service';
import { useNblocksConfig } from './use-nblocks-config';
import { useNblocksToken } from './use-nblocks-token';

interface UseFeatureFlagOptions {
  forceLive?: boolean;
}

const useFeatureFlag = (flagName: string, options: UseFeatureFlagOptions = {}): boolean => {
  const { forceLive = false } = options;
  const [isEnabled, setIsEnabled] = useState<boolean>(false);
  const config = useNblocksConfig();
  const { getAccessToken, isAuthenticated } = useNblocksToken();

  useEffect(() => {
    const checkFeatureFlag = async () => {
      try {
        const accessToken = getAccessToken();
        
        if (!accessToken) {
          setIsEnabled(false);
          return;
        }
        
        const enabled = await isFeatureEnabled(flagName, config.appId, accessToken, forceLive);
        setIsEnabled(enabled);
      } catch (error) {
        console.error(`Failed to check feature flag ${flagName}:`, error);
        setIsEnabled(false);
      }
    };

    checkFeatureFlag();
  }, [flagName, config.appId, getAccessToken, isAuthenticated, forceLive]);

  return isEnabled;
};

export default useFeatureFlag; 