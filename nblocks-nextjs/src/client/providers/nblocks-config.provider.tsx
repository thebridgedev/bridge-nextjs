'use client';

import { createContext, FC, ReactNode } from 'react';
import { NblocksConfig } from '../../shared/types/config';

/**
 * Default configuration values for nBlocks
 */
const DEFAULT_CONFIG: Partial<NblocksConfig> = {
  authBaseUrl: 'https://auth.nblocks.cloud',
  teamManagementUrl: 'https://backendless.nblocks.cloud/user-management-portal/users',
  defaultRedirectRoute: '/',
  loginRoute: '/login',
  debug: false
};

// Create the context with a default value
export const NblocksConfigContext = createContext<NblocksConfig | null>(null);

interface NblocksConfigProviderProps {
  config?: NblocksConfig;
  children: ReactNode;
}

/**
 * React context provider for nBlocks configuration
 * 
 * @example
 * // In your app/providers.tsx or similar
 * import { NblocksConfigProvider } from 'nblocks-nextjs/config';
 * 
 * <NblocksConfigProvider config={{
 *   appId: process.env.NEXT_PUBLIC_NBLOCKS_APP_ID!,
 *   // Other options are optional and will use defaults
 * }}>
 *   <App />
 * </NblocksConfigProvider>
 */
export const NblocksConfigProvider: FC<NblocksConfigProviderProps> = ({ config, children }) => {
  // Merge the provided config with default values
  const mergedConfig = {
    ...DEFAULT_CONFIG,
    ...config
  } as NblocksConfig;

  return (
    <NblocksConfigContext.Provider value={mergedConfig}>
      {children}
    </NblocksConfigContext.Provider>
  );
}; 