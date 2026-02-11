import { logger } from '../logger';
import { BridgeConfig } from '../types/config';
import { TokenService } from './token.service';

/**
 * Service for managing team-related functionality
 */
export class TeamManagementService {
  private static instance: TeamManagementService;
  private config: BridgeConfig | null = null;
  private tokenService: TokenService | null = null;

  private constructor() {}

  /**
   * Get the singleton instance of the TeamManagementService
   */
  public static getInstance(): TeamManagementService {
    if (!TeamManagementService.instance) {
      TeamManagementService.instance = new TeamManagementService();
    }
    return TeamManagementService.instance;
  }

  /**
   * Initialize the service with the required dependencies
   */
  public init(config: BridgeConfig, tokenService: TokenService): void {
    // Use the provided config directly
    this.config = config;
    this.tokenService = tokenService;
  }

  /**
   * Check if a token is available for team management
   */
  public hasToken(): boolean {
    if (!this.tokenService) {
      return false;
    }

    // Use the token service to check for token availability
    return this.tokenService.hasAccessToken();
  }

  /**
   * Launch the team management UI in a new window
   */
  public async launchTeamManagement(): Promise<void> {
    const url = await this.getTeamManagementUrl();
    window.open(url, '_blank');
  }

  /**
   * Get the team management URL (if you want to embed it in an iframe)
   */
  public async getTeamManagementUrl(): Promise<string> {
    if (!this.config || !this.tokenService) {
      throw new Error('TeamManagementService not initialized');
    }

    // Check if token is available
    if (!this.hasToken()) {
      logger.error('No access token available for team management');
      throw new Error('User must be authenticated to access team management');
    }

    // Get the token from the token service
    const token = this.tokenService.getAccessTokenClient();

    // If token is not available from the token service, try to get it from cookies
    let accessToken = token;
    if (!accessToken && typeof document !== 'undefined') {
      logger.debug('Token not found in token service, checking cookies...');
      const cookies = document.cookie.split(';');
      const accessTokenCookie = cookies.find(cookie => cookie.trim().startsWith('bridge_access_token='));

      if (accessTokenCookie) {
        accessToken = accessTokenCookie.split('=')[1];
        logger.debug('Token found in cookies');
      }
    }

    logger.debug('Access token available:', !!accessToken);

    if (!accessToken) {
      logger.error('No access token available for team management');
      throw new Error('User must be authenticated to access team management');
    }

    try {
      // Ensure we have the required config values
      const authBaseUrl = this.config.authBaseUrl || 'https://api.thebridge.dev/auth';
      const appId = this.config.appId;

      if (!appId) {
        throw new Error('appId is required for team management');
      }

      const redirectUri =
        this.config.callbackUrl ||
        (typeof window !== 'undefined' ? `${window.location.origin}/auth/oauth-callback` : '');

      logger.debug('Using authBaseUrl:', authBaseUrl);
      logger.debug('Fetching handover code from:', `${authBaseUrl}/handover/code/${appId}`);

      const response = await fetch(`${authBaseUrl}/handover/code/${appId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          accessToken,
          ...(redirectUri && { redirectUri }),
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error(`Failed to get handover code: ${response.status} ${response.statusText}`, errorText);
        throw new Error(`Failed to get handover code: ${response.statusText}`);
      }

      const data = await response.json();
      if (!data.code) {
        logger.error('No handover code in response:', data);
        throw new Error('Failed to get handover code: No code in response');
      }

      // Create the team management URL with the handover code
      const baseUrl = this.config.teamManagementUrl;
      const url = `${baseUrl}?code=${data.code}`;

      logger.debug('Team management URL created successfully', url);
      return url;
    } catch (error) {
      logger.error('Failed to get team management URL:', error);
      throw new Error('Failed to initialize team management: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  }
} 