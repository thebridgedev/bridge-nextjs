'use client';

import { FC, ReactNode } from 'react';
import { NblocksConfig } from '../../shared/types/config';
import { FeatureFlagsProvider } from './feature-flags.provider';
import { NblocksConfigProvider } from './nblocks-config.provider';
import { NblocksTokenProvider } from './nblocks-token.provider';

interface NblocksProviderProps {
  /** Your nBlocks application ID - can be provided directly or via config */
  appId?: string;
  /** Full nBlocks configuration object */
  config?: NblocksConfig;
  children: ReactNode;
}

/**
 * Main provider for nBlocks functionality
 * This provider wraps all nBlocks related providers
 * 
 * @example
 * // Simple usage with appId prop:
 * import { NblocksProvider } from 'nblocks-nextjs';
 * 
 * <NblocksProvider appId="your-app-id">
 *   <App />
 * </NblocksProvider>
 * 
 * // Advanced usage with full config:
 * <NblocksProvider config={{ appId: 'your-app-id', debug: true }}>
 *   <App />
 * </NblocksProvider>
 */
export const NblocksProvider: FC<NblocksProviderProps> = ({ appId, config, children }) => {
  // Runtime validation - ensure appId is provided
  if (!appId && !config?.appId) {
    throw new Error('NblocksProvider: appId is required. Please provide it via the appId prop or config.appId');
  }

  // Merge appId prop with config if both are provided
  const mergedConfig = appId ? { ...config, appId } : config;
  
  return (
    <NblocksConfigProvider config={mergedConfig}>
      <NblocksTokenProvider>
        <FeatureFlagsProvider>
          {children}
        </FeatureFlagsProvider>
      </NblocksTokenProvider>
    </NblocksConfigProvider>
  );
}; 