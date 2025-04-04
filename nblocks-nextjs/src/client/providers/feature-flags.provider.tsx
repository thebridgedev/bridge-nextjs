import React, { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import { getCachedFlags, loadFeatureFlags } from '../../shared/services/feature-flag.service';
import { useNblocksConfig } from '../hooks/use-nblocks-config';
import { useNblocksToken } from '../hooks/use-nblocks-token';

interface FeatureFlagsContextProps {
  flags: { [key: string]: boolean };
  refreshFlags: () => void;
}

const FeatureFlagsContext = createContext<FeatureFlagsContextProps | undefined>(undefined);

interface FeatureFlagsProviderProps {
  children: ReactNode;
}

export const FeatureFlagsProvider: React.FC<FeatureFlagsProviderProps> = ({ children }) => {
  const [flags, setFlags] = useState<{ [key: string]: boolean }>({});
  const config = useNblocksConfig();
  const { getAccessToken, isAuthenticated, isLoading } = useNblocksToken();

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