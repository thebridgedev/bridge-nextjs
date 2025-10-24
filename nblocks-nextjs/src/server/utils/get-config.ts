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
 * Get the nblocks configuration from environment variables
 * 
 * Configuration priority (highest to lowest):
 * 1. Environment variables (NEXT_PUBLIC_NBLOCKS_*)
 * 2. Props/overrides passed to the function
 * 3. Default values
 * 
 * @param overrides Optional configuration overrides (e.g., from props)
 * @returns The nblocks configuration
 */
export function getConfig(overrides?: Partial<NblocksConfig>): NblocksConfig {
  // Start with defaults
  const baseConfig = {
    ...DEFAULT_CONFIG,
    ...(overrides || {})
  };
  
  // Read from environment variables (these take highest priority)
  const envConfig: Partial<NblocksConfig> = {};
  
  const appId = process.env.NEXT_PUBLIC_NBLOCKS_APP_ID;
  const authBaseUrl = process.env.NEXT_PUBLIC_NBLOCKS_AUTH_BASE_URL;
  const callbackUrl = process.env.NEXT_PUBLIC_NBLOCKS_CALLBACK_URL;
  const teamManagementUrl = process.env.NEXT_PUBLIC_NBLOCKS_TEAM_MANAGEMENT_URL;
  const defaultRedirectRoute = process.env.NEXT_PUBLIC_NBLOCKS_DEFAULT_REDIRECT_ROUTE;
  const loginRoute = process.env.NEXT_PUBLIC_NBLOCKS_LOGIN_ROUTE;
  const debug = process.env.NEXT_PUBLIC_NBLOCKS_DEBUG;
  
  // Only override with env vars if they are set
  if (appId) envConfig.appId = appId;
  if (authBaseUrl) envConfig.authBaseUrl = authBaseUrl;
  if (callbackUrl) envConfig.callbackUrl = callbackUrl;
  if (teamManagementUrl) envConfig.teamManagementUrl = teamManagementUrl;
  if (defaultRedirectRoute) envConfig.defaultRedirectRoute = defaultRedirectRoute;
  if (loginRoute) envConfig.loginRoute = loginRoute;
  if (debug !== undefined) envConfig.debug = debug === 'true';
  
  // Merge with priority: defaults < overrides < env vars
  return {
    ...baseConfig,
    ...envConfig
  } as NblocksConfig;
} 