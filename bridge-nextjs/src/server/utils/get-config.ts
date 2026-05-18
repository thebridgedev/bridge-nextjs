import { BridgeConfig } from '../../shared/types/config';

/**
 * Default configuration values for bridge (server-side).
 *
 * Production fallbacks. Override per-environment via NEXT_PUBLIC_BRIDGE_*
 * env vars (preferred: `NEXT_PUBLIC_BRIDGE_API_BASE_URL` — `authBaseUrl` and
 * `cloudViewsUrl` are derived from it). This matches the auth-core convention
 * used by the client SDK, so server middleware and client hooks see the same
 * backend.
 */
const PROD_API_BASE_URL = 'https://api.thebridge.dev';

const DEFAULT_CONFIG: Partial<BridgeConfig> = {
  apiBaseUrl: PROD_API_BASE_URL,
  authBaseUrl: `${PROD_API_BASE_URL}/auth`,
  cloudViewsUrl: `${PROD_API_BASE_URL}/cloud-views`,
  teamManagementUrl: `${PROD_API_BASE_URL}/cloud-views/user-management-portal/users`,
  defaultRedirectRoute: '/',
  loginRoute: '/login',
  debug: false,
};

/**
 * Get the bridge configuration from environment variables.
 *
 * Priority (highest to lowest):
 *   1. Env vars (NEXT_PUBLIC_BRIDGE_*)
 *   2. Caller overrides
 *   3. Defaults
 *
 * `apiBaseUrl` is the auth-core root. When set (typically via
 * `NEXT_PUBLIC_BRIDGE_API_BASE_URL` from pre-setup's
 * `config/.env.demo.test.local`), this function derives `authBaseUrl` and
 * `cloudViewsUrl` from it. Legacy `NEXT_PUBLIC_BRIDGE_AUTH_BASE_URL` /
 * `NEXT_PUBLIC_BRIDGE_CLOUD_VIEWS_URL` are still honored if set explicitly
 * (they override the derived values), but they should not be needed for new
 * deployments.
 */
export function getConfig(overrides?: Partial<BridgeConfig>): BridgeConfig {
  const baseConfig: Partial<BridgeConfig> = {
    ...DEFAULT_CONFIG,
    ...(overrides ?? {}),
  };

  const envConfig: Partial<BridgeConfig> = {};

  const appId = process.env.NEXT_PUBLIC_BRIDGE_APP_ID;
  const apiBaseUrl = process.env.NEXT_PUBLIC_BRIDGE_API_BASE_URL;
  const authBaseUrl = process.env.NEXT_PUBLIC_BRIDGE_AUTH_BASE_URL;
  const callbackUrl = process.env.NEXT_PUBLIC_BRIDGE_CALLBACK_URL;
  const teamManagementUrl = process.env.NEXT_PUBLIC_BRIDGE_TEAM_MANAGEMENT_URL;
  const cloudViewsUrl = process.env.NEXT_PUBLIC_BRIDGE_CLOUD_VIEWS_URL;
  const defaultRedirectRoute = process.env.NEXT_PUBLIC_BRIDGE_DEFAULT_REDIRECT_ROUTE;
  const loginRoute = process.env.NEXT_PUBLIC_BRIDGE_LOGIN_ROUTE;
  const signupRoute = process.env.NEXT_PUBLIC_BRIDGE_SIGNUP_ROUTE;
  const debug = process.env.NEXT_PUBLIC_BRIDGE_DEBUG;

  if (appId) envConfig.appId = appId;

  // When apiBaseUrl is set, derive auth/cloudViews from it (auth-core
  // convention). Explicit *_AUTH_BASE_URL / *_CLOUD_VIEWS_URL still wins.
  if (apiBaseUrl) {
    const trimmed = apiBaseUrl.replace(/\/$/, '');
    envConfig.apiBaseUrl = trimmed;
    envConfig.authBaseUrl = `${trimmed}/auth`;
    envConfig.cloudViewsUrl = `${trimmed}/cloud-views`;
    envConfig.teamManagementUrl = `${trimmed}/cloud-views/user-management-portal/users`;
  }

  if (authBaseUrl) envConfig.authBaseUrl = authBaseUrl;
  if (callbackUrl) envConfig.callbackUrl = callbackUrl;
  if (teamManagementUrl) envConfig.teamManagementUrl = teamManagementUrl;
  if (cloudViewsUrl) envConfig.cloudViewsUrl = cloudViewsUrl;
  if (defaultRedirectRoute) envConfig.defaultRedirectRoute = defaultRedirectRoute;
  if (loginRoute) envConfig.loginRoute = loginRoute;
  if (signupRoute) envConfig.signupRoute = signupRoute;
  if (debug !== undefined) envConfig.debug = debug === 'true';

  return {
    ...baseConfig,
    ...envConfig,
  } as BridgeConfig;
}
