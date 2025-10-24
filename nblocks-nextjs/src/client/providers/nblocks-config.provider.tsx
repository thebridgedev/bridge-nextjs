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

/**
 * Reads configuration from environment variables
 * All env vars are prefixed with NEXT_PUBLIC_NBLOCKS_
 * These are available on both server and client in Next.js
 */
const getConfigFromEnv = (): Partial<NblocksConfig> => {
  const envConfig: Partial<NblocksConfig> = {};

  // Read from environment variables (NEXT_PUBLIC_* vars are available on both server and client)
  const appId = process.env.NEXT_PUBLIC_NBLOCKS_APP_ID;
  const callbackUrl = process.env.NEXT_PUBLIC_NBLOCKS_CALLBACK_URL;
  const authBaseUrl = process.env.NEXT_PUBLIC_NBLOCKS_AUTH_BASE_URL;
  const defaultRedirectRoute = process.env.NEXT_PUBLIC_NBLOCKS_DEFAULT_REDIRECT_ROUTE;
  const loginRoute = process.env.NEXT_PUBLIC_NBLOCKS_LOGIN_ROUTE;
  const teamManagementUrl = process.env.NEXT_PUBLIC_NBLOCKS_TEAM_MANAGEMENT_URL;
  const debug = process.env.NEXT_PUBLIC_NBLOCKS_DEBUG;

  if (appId) envConfig.appId = appId;
  if (callbackUrl) envConfig.callbackUrl = callbackUrl;
  if (authBaseUrl) envConfig.authBaseUrl = authBaseUrl;
  if (defaultRedirectRoute) envConfig.defaultRedirectRoute = defaultRedirectRoute;
  if (loginRoute) envConfig.loginRoute = loginRoute;
  if (teamManagementUrl) envConfig.teamManagementUrl = teamManagementUrl;
  if (debug !== undefined) envConfig.debug = debug === 'true';

  return envConfig;
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
 * Configuration priority (highest to lowest):
 * 1. Environment variables (NEXT_PUBLIC_NBLOCKS_*)
 * 2. Props passed to provider (config or appId)
 * 3. Default values
 * 
 * @example
 * // Option 1: Using environment variables only (recommended)
 * // Set NEXT_PUBLIC_NBLOCKS_APP_ID in your .env.local
 * <NblocksConfigProvider>
 *   <App />
 * </NblocksConfigProvider>
 * 
 * @example
 * // Option 2: Using props (still supported)
 * import { NblocksConfigProvider } from 'nblocks-nextjs/config';
 * 
 * <NblocksConfigProvider config={{
 *   appId: 'your-app-id',
 *   // Other options are optional and will use defaults
 * }}>
 *   <App />
 * </NblocksConfigProvider>
 */
export const NblocksConfigProvider: FC<NblocksConfigProviderProps> = ({ config, children }) => {
  // Merge configs with priority: env vars > props > defaults
  const envConfig = getConfigFromEnv();
  const mergedConfig = {
    ...DEFAULT_CONFIG,
    ...config,
    ...envConfig // Environment variables take highest priority
  } as NblocksConfig;

  return (
    <NblocksConfigContext.Provider value={mergedConfig}>
      {children}
    </NblocksConfigContext.Provider>
  );
}; 