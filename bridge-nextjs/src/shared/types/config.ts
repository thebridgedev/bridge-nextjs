/**
 * bridge configuration interface
 * 
 * Configuration can be provided via:
 * 1. Environment variables (recommended) - prefixed with NEXT_PUBLIC_BRIDGE_*
 * 2. Props passed to BridgeProvider
 * 3. Default values
 * 
 * @example Environment Variables (Recommended)
 * ```env
 * NEXT_PUBLIC_BRIDGE_APP_ID=your-app-id
 * NEXT_PUBLIC_BRIDGE_AUTH_BASE_URL=https://api.thebridge.dev/auth
 * NEXT_PUBLIC_BRIDGE_DEBUG=true
 * ```
 */
export interface BridgeConfig {
  /**
   * Your bridge application ID
   * @required - Must be provided via env var (NEXT_PUBLIC_BRIDGE_APP_ID) or props
   * @env NEXT_PUBLIC_BRIDGE_APP_ID
   */
  appId?: string;

  /**
   * The URL to redirect to after successful login
   * @default The current origin + '/auth/callback'
   * @env NEXT_PUBLIC_BRIDGE_CALLBACK_URL
   */
  callbackUrl?: string;

  /**
   * The base URL for bridge auth services
   * @default 'https://api.thebridge.dev/auth'
   * @env NEXT_PUBLIC_BRIDGE_AUTH_BASE_URL
   */
  authBaseUrl?: string;

  /**
   * Route to redirect to after login
   * @default '/'
   * @env NEXT_PUBLIC_BRIDGE_DEFAULT_REDIRECT_ROUTE
   */
  defaultRedirectRoute?: string;

  /**
   * Route to redirect to when authentication fails
   * @default '/login'
   * @env NEXT_PUBLIC_BRIDGE_LOGIN_ROUTE
   */
  loginRoute?: string;

  /**
   * URL for the team management portal
   * @default 'https://api.thebridge.dev/cloud-views/user-management-portal/users'
   * @env NEXT_PUBLIC_BRIDGE_TEAM_MANAGEMENT_URL
   */
  teamManagementUrl?: string;

  /**
   * Base URL for bridge cloud-views service (feature flags, plan selection, payments, etc.)
   * @default 'https://api.thebridge.dev/cloud-views'
   * @env NEXT_PUBLIC_BRIDGE_CLOUD_VIEWS_URL
   */
  cloudViewsUrl?: string;

  /**
   * Debug mode
   * @default false
   * @env NEXT_PUBLIC_BRIDGE_DEBUG
   */
  debug?: boolean;
} 