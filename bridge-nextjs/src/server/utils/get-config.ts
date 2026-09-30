import { BridgeConfig } from '../../shared/types/config';
import { createBridgeConfig } from '../../shared/resolve-config';

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
  // No `loginRoute` default (TBP-629 follow-up). The middleware reads a set
  // `loginRoute` as "SDK mode: redirect to the app's own login page"; a default
  // here made every hosted-mode app (no NEXT_PUBLIC_BRIDGE_LOGIN_ROUTE) send
  // signed-out visitors to `/login?redirectUri=…` on its own origin instead of
  // the hosted login page. Set NEXT_PUBLIC_BRIDGE_LOGIN_ROUTE for SDK mode.
  debug: false,
};

/**
 * The bridge configuration for server code (middleware, route handlers).
 *
 * Priority (highest to lowest) — the same rule as `<BridgeProvider>` and
 * `createBridgeConfig()` (TBP-742; env used to win over explicit overrides):
 *   1. Caller overrides (e.g. `withBridgeAuth({ appId })`)
 *   2. Env vars (NEXT_PUBLIC_BRIDGE_*)
 *   3. Defaults
 *
 * `authBaseUrl`, `cloudViewsUrl` and `teamManagementUrl` are derived from the
 * resolved `apiBaseUrl` (auth-core convention). The legacy
 * `NEXT_PUBLIC_BRIDGE_AUTH_BASE_URL` / `_CLOUD_VIEWS_URL` /
 * `_TEAM_MANAGEMENT_URL` variables still override the derived values, and an
 * explicit override beats them all. `hostedUrl` follows the API address on
 * Bridge's own domains, like the client.
 */
export function getConfig(overrides?: Partial<BridgeConfig>): BridgeConfig {
  const explicit: Partial<BridgeConfig> = { ...(overrides ?? {}) };
  const resolved = createBridgeConfig(explicit, { requireAppId: false, dev: false });

  const apiBaseUrl = (resolved.apiBaseUrl ?? PROD_API_BASE_URL).replace(/\/+$/, '');
  const present = (v: string | undefined) => (v && v.trim() ? v.trim() : undefined);

  return {
    ...DEFAULT_CONFIG,
    ...resolved,
    apiBaseUrl,
    authBaseUrl:
      present(explicit.authBaseUrl) ?? present(process.env.NEXT_PUBLIC_BRIDGE_AUTH_BASE_URL) ?? `${apiBaseUrl}/auth`,
    cloudViewsUrl:
      present(explicit.cloudViewsUrl) ??
      present(process.env.NEXT_PUBLIC_BRIDGE_CLOUD_VIEWS_URL) ??
      `${apiBaseUrl}/cloud-views`,
    teamManagementUrl:
      present(explicit.teamManagementUrl) ??
      present(process.env.NEXT_PUBLIC_BRIDGE_TEAM_MANAGEMENT_URL) ??
      `${apiBaseUrl}/cloud-views/user-management-portal/users`,
    defaultRedirectRoute: resolved.defaultRedirectRoute ?? DEFAULT_CONFIG.defaultRedirectRoute,
    debug: resolved.debug ?? false,
  } as BridgeConfig;
}
