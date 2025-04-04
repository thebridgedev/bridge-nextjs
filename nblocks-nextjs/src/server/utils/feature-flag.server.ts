import { NextRequest } from 'next/server';
import { getCachedFlags, isFeatureEnabled, loadFeatureFlags } from '../../shared/services/feature-flag.service';
import { NblocksConfig } from '../../shared/types/config';
import { getConfig } from './get-config';
import { TokenServiceServer } from './token-service.server';

/**
 * Server-side feature flag utility class
 * Provides methods for checking feature flags on the server side
 */
export class FeatureFlagServer {
  private static instance: FeatureFlagServer;
  private config: NblocksConfig | null = null;
  
  private constructor() {}
  
  static getInstance(): FeatureFlagServer {
    if (!FeatureFlagServer.instance) {
      FeatureFlagServer.instance = new FeatureFlagServer();
    }
    return FeatureFlagServer.instance;
  }
  
  /**
   * Initialize the feature flag server with configuration
   * @param config The nBlocks configuration object
   */
  init(config: NblocksConfig): void {
    this.config = config;
  }
  
  /**
   * Check if a feature flag is enabled on the server
   * @param flagName The name of the feature flag to check
   * @param request NextRequest object to extract the access token
   * @param forceLive Whether to force a live check (bypass cache)
   * @returns Promise resolving to boolean indicating if the flag is enabled
   */
  async isFeatureEnabledServer(
    flagName: string, 
    request: NextRequest, 
    forceLive: boolean = false
  ): Promise<boolean> {
    // Get config for app ID if not already initialized
    if (!this.config) {
      this.config = getConfig();
    }
    
    if (!this.config?.appId) {
      console.error('FeatureFlagServer - No appId available. Make sure to properly initialize with a valid config.');
      return false;
    }
    
    // Get access token from request
    const tokenService = TokenServiceServer.getInstance();
    const cookieString = request.headers.get('cookie') || '';
    const accessToken = tokenService.getAccessTokenServer(cookieString);
    
    if (!accessToken) {
      console.warn(`FeatureFlagServer - No access token available for flag check: ${flagName}`);
      return false;
    }
    
    try {
      return await isFeatureEnabled(flagName, this.config.appId, accessToken, forceLive);
    } catch (error) {
      console.error(`FeatureFlagServer - Error checking feature flag ${flagName}:`, error);
      return false;
    }
  }
  
  /**
   * Load all feature flags on the server
   * @param request NextRequest object to extract the access token
   * @returns Promise resolving to an object containing all flag states
   */
  async loadAllFlagsServer(request: NextRequest): Promise<{ [key: string]: boolean }> {
    // Get config for app ID if not already initialized
    if (!this.config) {
      this.config = getConfig();
    }
    
    if (!this.config?.appId) {
      console.error('FeatureFlagServer - No appId available. Make sure to properly initialize with a valid config.');
      return {};
    }
    
    // Get access token from request
    const tokenService = TokenServiceServer.getInstance();
    const cookieString = request.headers.get('cookie') || '';
    const accessToken = tokenService.getAccessTokenServer(cookieString);
    
    if (!accessToken) {
      console.warn('FeatureFlagServer - No access token available for loading flags');
      return {};
    }
    
    try {
      await loadFeatureFlags(this.config.appId, accessToken);
      return getCachedFlags();
    } catch (error) {
      console.error('FeatureFlagServer - Error loading feature flags:', error);
      return {};
    }
  }
} 