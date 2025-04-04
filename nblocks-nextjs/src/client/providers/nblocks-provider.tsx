import React, { ReactNode } from 'react';
import { NblocksConfig } from '../../shared/types/config';
import { FeatureFlagsProvider } from './feature-flags.provider';
import { NblocksConfigProvider } from './nblocks-config.provider';
import { NblocksTokenProvider } from './nblocks-token.provider';

interface NblocksProviderProps {
  config?: NblocksConfig;
  children: ReactNode;
}

/**
 * Main provider for nBlocks functionality
 * This provider wraps all nBlocks related providers
 * 
 * @example
 * // In your app's root component
 * import { NblocksProvider } from 'nblocks-nextjs';
 * 
 * // Usage example:
 * // <NblocksProvider config={{ appId: 'your-app-id' }}>
 * //   <App />
 * // </NblocksProvider>
 */
export const NblocksProvider: React.FC<NblocksProviderProps> = ({ config, children }) => {
  return (
    <NblocksConfigProvider config={config}>
      <NblocksTokenProvider>
        <FeatureFlagsProvider>
          {children}
        </FeatureFlagsProvider>
      </NblocksTokenProvider>
    </NblocksConfigProvider>
  );
}; 