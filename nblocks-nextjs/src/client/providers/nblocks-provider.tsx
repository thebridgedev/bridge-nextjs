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
 * Configuration priority (highest to lowest):
 * 1. Environment variables (NEXT_PUBLIC_NBLOCKS_APP_ID, etc.)
 * 2. Props passed to this provider
 * 3. Default values
 * 
 * @example
 * // Recommended: Using environment variables
 * // Set NEXT_PUBLIC_NBLOCKS_APP_ID in your .env.local
 * import { NblocksProvider } from 'nblocks-nextjs';
 * 
 * <NblocksProvider>
 *   <App />
 * </NblocksProvider>
 * 
 * @example
 * // Alternative: Using appId prop
 * <NblocksProvider appId="your-app-id">
 *   <App />
 * </NblocksProvider>
 * 
 * @example
 * // Advanced: Using full config object
 * <NblocksProvider config={{ appId: 'your-app-id', debug: true }}>
 *   <App />
 * </NblocksProvider>
 */
export const NblocksProvider: FC<NblocksProviderProps> = ({ appId, config, children }) => {
  // Merge appId prop with config if both are provided
  // The actual validation and env var reading happens in NblocksConfigProvider
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