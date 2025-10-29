'use client';

import { useContext } from 'react';
import { BridgeConfig } from '../../shared/types/config';
import { BridgeConfigContext } from '../providers/bridge-config.provider';

/**
 * Hook for accessing bridge configuration
 * 
 * @returns The bridge configuration
 * 
 * @example
 * import { useBridgeConfig } from 'bridge-nextjs';
 * 
 * function MyComponent() {
 *   const config = useBridgeConfig();
 *   
 *   return (
 *     <div>
 *       <p>App ID: {config.appId}</p>
 *       <p>Auth Base URL: {config.authBaseUrl}</p>
 *     </div>
 *   );
 * }
 */
export const useBridgeConfig = (): BridgeConfig => {
  const config = useContext(BridgeConfigContext);
  if (!config) {
    throw new Error('BridgeConfigProvider has not been initialized. Make sure it is used within a BridgeConfigProvider.');
  }
  
  // Check if appId is missing
  if (!config.appId) {
    throw new Error('bridge appId is required but was not provided in the configuration.');
  }
  
  return config;
}; 