import { BridgeConfig } from '../../shared/types/config';

/**
 * Default configuration values for bridge
 */
const DEFAULT_CONFIG: Partial<BridgeConfig> = {
  authBaseUrl: 'https://api.thebridge.dev/auth',
  teamManagementUrl: 'https://api.thebridge.dev/cloud-views/user-management-portal/users',
  cloudViewsUrl: 'https://api.thebridge.dev/cloud-views',
  defaultRedirectRoute: '/',
  loginRoute: '/login',
  debug: false
};

/**
 * Get the bridge configuration from environment variables
 * 
 * Configuration priority (highest to lowest):
 * 1. Environment variables (NEXT_PUBLIC_BRIDGE_*)
 * 2. Props/overrides passed to the function
 * 3. Default values
 * 
 * @param overrides Optional configuration overrides (e.g., from props)
 * @returns The bridge configuration
 */
export function getConfig(overrides?: Partial<BridgeConfig>): BridgeConfig {
  // Start with defaults
  const baseConfig = {
    ...DEFAULT_CONFIG,
    ...(overrides || {})
  };
  
  // Read from environment variables (these take highest priority)
  const envConfig: Partial<BridgeConfig> = {};
  
  const appId = process.env.NEXT_PUBLIC_BRIDGE_APP_ID;
  const authBaseUrl = process.env.NEXT_PUBLIC_BRIDGE_AUTH_BASE_URL;
  const callbackUrl = process.env.NEXT_PUBLIC_BRIDGE_CALLBACK_URL;
  const teamManagementUrl = process.env.NEXT_PUBLIC_BRIDGE_TEAM_MANAGEMENT_URL;
  const cloudViewsUrl = process.env.NEXT_PUBLIC_BRIDGE_CLOUD_VIEWS_URL;
  const defaultRedirectRoute = process.env.NEXT_PUBLIC_BRIDGE_DEFAULT_REDIRECT_ROUTE;
  const loginRoute = process.env.NEXT_PUBLIC_BRIDGE_LOGIN_ROUTE;
  const debug = process.env.NEXT_PUBLIC_BRIDGE_DEBUG;

  // Only override with env vars if they are set
  if (appId) envConfig.appId = appId;
  if (authBaseUrl) envConfig.authBaseUrl = authBaseUrl;
  if (callbackUrl) envConfig.callbackUrl = callbackUrl;
  if (teamManagementUrl) envConfig.teamManagementUrl = teamManagementUrl;
  if (cloudViewsUrl) envConfig.cloudViewsUrl = cloudViewsUrl;
  if (defaultRedirectRoute) envConfig.defaultRedirectRoute = defaultRedirectRoute;
  if (loginRoute) envConfig.loginRoute = loginRoute;
  if (debug !== undefined) envConfig.debug = debug === 'true';
  
  // Merge with priority: defaults < overrides < env vars
  return {
    ...baseConfig,
    ...envConfig
  } as BridgeConfig;
} 