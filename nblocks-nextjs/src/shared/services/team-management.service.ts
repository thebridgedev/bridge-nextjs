import { NblocksConfig } from '../types/config';
import { TokenService } from './token.service';

/**
 * Service for managing team-related functionality
 */
export class TeamManagementService {
  private static instance: TeamManagementService;
  private config: NblocksConfig | null = null;
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
  public init(config: NblocksConfig, tokenService: TokenService): void {
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
      console.error('No access token available for team management');
      throw new Error('User must be authenticated to access team management');
    }

    // Get the token from the token service
    const token = this.tokenService.getAccessTokenClient();
    
    // If token is not available from the token service, try to get it from cookies
    let accessToken = token;
    if (!accessToken && typeof document !== 'undefined') {
      console.log('Token not found in token service, checking cookies...');
      const cookies = document.cookie.split(';');
      const accessTokenCookie = cookies.find(cookie => cookie.trim().startsWith('nblocks_access_token='));
      
      if (accessTokenCookie) {
        accessToken = accessTokenCookie.split('=')[1];
        console.log('Token found in cookies');
      }
    }
    
    // Log token availability for debugging
    console.log('Access token available:', !!accessToken);
    
    if (!accessToken) {
      console.error('No access token available for team management');
      throw new Error('User must be authenticated to access team management');
    }

    try {
      // Ensure we have the required config values
      const authBaseUrl = this.config.authBaseUrl || 'https://auth.nblocks.cloud';
      const appId = this.config.appId;
      
      if (!appId) {
        throw new Error('appId is required for team management');
      }
      
      console.log('Config structure:', JSON.stringify(this.config, null, 2));
      console.log('Using authBaseUrl:', authBaseUrl);
      
      // Get handover code from nBlocks
      console.log('Fetching handover code from:', `${authBaseUrl}/handover/code/${appId}`);
      
      const response = await fetch(
        `${authBaseUrl}/handover/code/${appId}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ accessToken: accessToken }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Failed to get handover code: ${response.status} ${response.statusText}`, errorText);
        throw new Error(`Failed to get handover code: ${response.statusText}`);
      }

      const data = await response.json();
      if (!data.code) {
        console.error('No handover code in response:', data);
        throw new Error('Failed to get handover code: No code in response');
      }

      // Create the team management URL with the handover code
      const baseUrl = this.config.teamManagementUrl;
      const url = `${baseUrl}?code=${data.code}`;

      console.log('Team management URL created successfully', url);
      return url;
    } catch (error) {
      console.error('Failed to get team management URL:', error);
      throw new Error('Failed to initialize team management: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  }
} 