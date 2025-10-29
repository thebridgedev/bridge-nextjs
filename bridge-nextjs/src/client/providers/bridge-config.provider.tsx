'use client';

import { createContext, FC, ReactNode } from 'react';
import { BridgeConfig } from '../../shared/types/config';

/**
 * Default configuration values for bridge
 */
const DEFAULT_CONFIG: Partial<BridgeConfig> = {
  authBaseUrl: 'https://auth.nblocks.cloud',
  teamManagementUrl: 'https://backendless.nblocks.cloud/user-management-portal/users',
  defaultRedirectRoute: '/',
  loginRoute: '/login',
  debug: false
};

/**
 * Reads configuration from environment variables
 * All env vars are prefixed with NEXT_PUBLIC_BRIDGE_
 * These are available on both server and client in Next.js
 */
const getConfigFromEnv = (): Partial<BridgeConfig> => {
  const envConfig: Partial<BridgeConfig> = {};

  // Read from environment variables (NEXT_PUBLIC_* vars are available on both server and client)
  const appId = process.env.NEXT_PUBLIC_BRIDGE_APP_ID;
  const callbackUrl = process.env.NEXT_PUBLIC_BRIDGE_CALLBACK_URL;
  const authBaseUrl = process.env.NEXT_PUBLIC_BRIDGE_AUTH_BASE_URL;
  const defaultRedirectRoute = process.env.NEXT_PUBLIC_BRIDGE_DEFAULT_REDIRECT_ROUTE;
  const loginRoute = process.env.NEXT_PUBLIC_BRIDGE_LOGIN_ROUTE;
  const teamManagementUrl = process.env.NEXT_PUBLIC_BRIDGE_TEAM_MANAGEMENT_URL;
  const debug = process.env.NEXT_PUBLIC_BRIDGE_DEBUG;

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
export const BridgeConfigContext = createContext<BridgeConfig | null>(null);

interface BridgeConfigProviderProps {
  config?: BridgeConfig;
  children: ReactNode;
}

/**
 * React context provider for bridge configuration
 * 
 * Configuration priority (highest to lowest):
 * 1. Environment variables (NEXT_PUBLIC_BRIDGE_*)
 * 2. Props passed to provider (config or appId)
 * 3. Default values
 * 
 * @example
 * // Option 1: Using environment variables only (recommended)
 * // Set NEXT_PUBLIC_BRIDGE_APP_ID in your .env.local
 * <BridgeConfigProvider>
 *   <App />
 * </BridgeConfigProvider>
 * 
 * @example
 * // Option 2: Using props (still supported)
 * import { BridgeConfigProvider } from 'bridge-nextjs/config';
 * 
 * <BridgeConfigProvider config={{
 *   appId: 'your-app-id',
 *   // Other options are optional and will use defaults
 * }}>
 *   <App />
 * </BridgeConfigProvider>
 */
export const BridgeConfigProvider: FC<BridgeConfigProviderProps> = ({ config, children }) => {
  // Merge configs with priority: env vars > props > defaults
  const envConfig = getConfigFromEnv();
  const mergedConfig = {
    ...DEFAULT_CONFIG,
    ...config,
    ...envConfig // Environment variables take highest priority
  } as BridgeConfig;

  return (
    <BridgeConfigContext.Provider value={mergedConfig}>
      {children}
    </BridgeConfigContext.Provider>
  );
}; 