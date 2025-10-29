'use client';

import { createContext, FC, ReactNode, useContext, useEffect, useState } from 'react';
import { getCachedFlags, loadFeatureFlags } from '../../shared/services/feature-flag.service';
import { useBridgeConfig } from '../hooks/use-bridge-config';
import { useBridgeToken } from '../hooks/use-bridge-token';

interface FeatureFlagsContextProps {
  flags: { [key: string]: boolean };
  refreshFlags: () => void;
}

const FeatureFlagsContext = createContext<FeatureFlagsContextProps | undefined>(undefined);

interface FeatureFlagsProviderProps {
  children: ReactNode;
}

export const FeatureFlagsProvider: FC<FeatureFlagsProviderProps> = ({ children }) => {
  const [flags, setFlags] = useState<{ [key: string]: boolean }>({});
  const config = useBridgeConfig();
  const { getAccessToken, isAuthenticated, isLoading } = useBridgeToken();

  useEffect(() => {
    const fetchFlags = async () => {
      try {
        // Only fetch flags if user is authenticated
        if (!isAuthenticated || isLoading) {
          return;
        }

        const accessToken = getAccessToken();
        if (!accessToken) {
          return;
        }

        if (!config.appId) {
          console.error('appId is required for feature flag loading');
          return;
        }
        
        await loadFeatureFlags(config.appId, accessToken);
        const updatedFlags = getCachedFlags();
        setFlags(updatedFlags);
      } catch (error) {
        console.error('Failed to load feature flags:', error);
      }
    };

    fetchFlags();
  }, [config.appId, getAccessToken, isAuthenticated, isLoading]);

  const refreshFlags = async () => {
    try {
      if (!isAuthenticated) {
        return;
      }

      const accessToken = getAccessToken();
      if (!accessToken) {
        return;
      }

      if (!config.appId) {
        console.error('appId is required for feature flag loading');
        return;
      }
      
      await loadFeatureFlags(config.appId, accessToken);
      const updatedFlags = getCachedFlags();
      setFlags(updatedFlags);
    } catch (error) {
      console.error('Failed to refresh feature flags:', error);
    }
  };

  return (
    <FeatureFlagsContext.Provider value={{ flags, refreshFlags }}>
      {children}
    </FeatureFlagsContext.Provider>
  );
};

export const useFeatureFlagsContext = (): FeatureFlagsContextProps => {
  const context = useContext(FeatureFlagsContext);
  if (!context) {
    throw new Error('useFeatureFlagsContext must be used within a FeatureFlagsProvider');
  }
  return context;
}; 