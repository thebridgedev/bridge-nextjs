/**
 * nBlocks configuration interface
 * 
 * Configuration can be provided via:
 * 1. Environment variables (recommended) - prefixed with NEXT_PUBLIC_NBLOCKS_*
 * 2. Props passed to NblocksProvider
 * 3. Default values
 * 
 * @example Environment Variables (Recommended)
 * ```env
 * NEXT_PUBLIC_NBLOCKS_APP_ID=your-app-id
 * NEXT_PUBLIC_NBLOCKS_AUTH_BASE_URL=https://auth.nblocks.cloud
 * NEXT_PUBLIC_NBLOCKS_DEBUG=true
 * ```
 */
export interface NblocksConfig {
  /**
   * Your nBlocks application ID
   * @required - Must be provided via env var (NEXT_PUBLIC_NBLOCKS_APP_ID) or props
   * @env NEXT_PUBLIC_NBLOCKS_APP_ID
   */
  appId?: string;

  /**
   * The URL to redirect to after successful login
   * @default The current origin + '/auth/callback'
   * @env NEXT_PUBLIC_NBLOCKS_CALLBACK_URL
   */
  callbackUrl?: string;

  /**
   * The base URL for nBlocks auth services
   * @default 'https://auth.nblocks.cloud'
   * @env NEXT_PUBLIC_NBLOCKS_AUTH_BASE_URL
   */
  authBaseUrl?: string;

  /**
   * Route to redirect to after login
   * @default '/'
   * @env NEXT_PUBLIC_NBLOCKS_DEFAULT_REDIRECT_ROUTE
   */
  defaultRedirectRoute?: string;

  /**
   * Route to redirect to when authentication fails
   * @default '/login'
   * @env NEXT_PUBLIC_NBLOCKS_LOGIN_ROUTE
   */
  loginRoute?: string;

  /**
   * URL for the team management portal
   * @default 'https://backendless.nblocks.cloud'
   * @env NEXT_PUBLIC_NBLOCKS_TEAM_MANAGEMENT_URL
   */
  teamManagementUrl?: string;

  /**
   * Debug mode
   * @default false
   * @env NEXT_PUBLIC_NBLOCKS_DEBUG
   */
  debug?: boolean;
} 