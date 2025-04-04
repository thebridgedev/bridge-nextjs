export interface NblocksConfig {
  /**
   * Your nBlocks application ID
   */
  appId: string;

  /**
   * The URL to redirect to after successful login
   * Defaults to the current origin + '/auth/callback'
   */
  callbackUrl?: string;

  /**
   * The base URL for nBlocks auth services
   * @default 'https://auth.nblocks.cloud'
   */
  authBaseUrl?: string;

  /**
   * Route to redirect to after login
   * @default '/'
   */
  defaultRedirectRoute?: string;

  /**
   * Route to redirect to when authentication fails
   * @default '/login'
   */
  loginRoute?: string;

  /**
   * URL for the team management portal, defaults to backendless.nblocks.cloud
   */
  teamManagementUrl?: string;

  /**
   * Debug mode
   */
  debug?: boolean;
} 