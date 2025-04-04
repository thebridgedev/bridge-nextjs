import { useContext } from 'react';
import { NblocksConfig } from '../../shared/types/config';
import { NblocksConfigContext } from '../providers/nblocks-config.provider';

/**
 * Hook for accessing nBlocks configuration
 * 
 * @returns The nBlocks configuration
 * 
 * @example
 * import { useNblocksConfig } from 'nblocks-nextjs';
 * 
 * function MyComponent() {
 *   const config = useNblocksConfig();
 *   
 *   return (
 *     <div>
 *       <p>App ID: {config.appId}</p>
 *       <p>Auth Base URL: {config.authBaseUrl}</p>
 *     </div>
 *   );
 * }
 */
export const useNblocksConfig = (): NblocksConfig => {
  const config = useContext(NblocksConfigContext);
  if (!config) {
    throw new Error('NblocksConfigProvider has not been initialized. Make sure it is used within a NblocksConfigProvider.');
  }
  
  // Check if appId is missing
  if (!config.appId) {
    throw new Error('nBlocks appId is required but was not provided in the configuration.');
  }
  
  return config;
}; 