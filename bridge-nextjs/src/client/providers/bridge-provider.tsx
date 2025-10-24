'use client';

import { FC, ReactNode } from 'react';
import { BridgeConfig } from '../../shared/types/config';
import { FeatureFlagsProvider } from './feature-flags.provider';
import { BridgeConfigProvider } from './bridge-config.provider';
import { BridgeTokenProvider } from './bridge-token.provider';

interface BridgeProviderProps {
  /** Your bridge application ID - can be provided directly or via config */
  appId?: string;
  /** Full bridge configuration object */
  config?: BridgeConfig;
  children: ReactNode;
}

/**
 * Main provider for bridge functionality
 * This provider wraps all bridge related providers
 * 
 * Configuration priority (highest to lowest):
 * 1. Environment variables (NEXT_PUBLIC_BRIDGE_APP_ID, etc.)
 * 2. Props passed to this provider
 * 3. Default values
 * 
 * @example
 * // Recommended: Using environment variables
 * // Set NEXT_PUBLIC_BRIDGE_APP_ID in your .env.local
 * import { BridgeProvider } from 'bridge-nextjs';
 * 
 * <BridgeProvider>
 *   <App />
 * </BridgeProvider>
 * 
 * @example
 * // Alternative: Using appId prop
 * <BridgeProvider appId="your-app-id">
 *   <App />
 * </BridgeProvider>
 * 
 * @example
 * // Advanced: Using full config object
 * <BridgeProvider config={{ appId: 'your-app-id', debug: true }}>
 *   <App />
 * </BridgeProvider>
 */
export const BridgeProvider: FC<BridgeProviderProps> = ({ appId, config, children }) => {
  // Merge appId prop with config if both are provided
  // The actual validation and env var reading happens in BridgeConfigProvider
  const mergedConfig = appId ? { ...config, appId } : config;
  
  return (
    <BridgeConfigProvider config={mergedConfig}>
      <BridgeTokenProvider>
        <FeatureFlagsProvider>
          {children}
        </FeatureFlagsProvider>
      </BridgeTokenProvider>
    </BridgeConfigProvider>
  );
}; 