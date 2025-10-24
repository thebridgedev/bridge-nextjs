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
 * @param overrides Optional configuration overrides (e.g., from props)
 * @returns The nblocks configuration
 */
export function getConfig(overrides?: Partial<NblocksConfig>): NblocksConfig {
  // Use only NEXT_PUBLIC_ prefixed environment variables
  const appId = process.env.NEXT_PUBLIC_NBLOCKS_APP_ID || '';
  
  const authBaseUrl = process.env.NEXT_PUBLIC_NBLOCKS_AUTH_BASE_URL || 
                     DEFAULT_CONFIG.authBaseUrl;
  
  const callbackUrl = process.env.NEXT_PUBLIC_NBLOCKS_CALLBACK_URL || '';
  
  const teamManagementUrl = process.env.NEXT_PUBLIC_NBLOCKS_TEAM_MANAGEMENT_URL || 
                           DEFAULT_CONFIG.teamManagementUrl;
  
  const defaultRedirectRoute = process.env.NEXT_PUBLIC_NBLOCKS_DEFAULT_REDIRECT_ROUTE || 
                              DEFAULT_CONFIG.defaultRedirectRoute;
  
  const loginRoute = process.env.NEXT_PUBLIC_NBLOCKS_LOGIN_ROUTE || 
                    DEFAULT_CONFIG.loginRoute;
  
  const debug = process.env.NEXT_PUBLIC_NBLOCKS_DEBUG === 'true' || 
                DEFAULT_CONFIG.debug;
  
  const config = {
    appId,
    authBaseUrl,
    callbackUrl,
    teamManagementUrl,
    defaultRedirectRoute,
    loginRoute,
    debug
  };

  // Apply overrides if provided (props take precedence over env vars)
  if (overrides) {
    return { ...config, ...overrides };
  }

  return config;
} 