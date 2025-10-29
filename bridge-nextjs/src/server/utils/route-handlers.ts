import { NextRequest, NextResponse } from 'next/server';
import { BridgeConfig } from '../../shared/types/config';
import { FeatureFlagServer } from './feature-flag.server';
import { getConfig } from './get-config';

/**
 * Options for the requireFeatureFlagForRoute function
 */
interface RequireFeatureFlagOptions {
  /**
   * Optional config overrides
   */
  config?: Partial<BridgeConfig>;
  
  /**
   * Custom error message to return when the feature flag is disabled
   */
  errorMessage?: string;
  
  /**
   * HTTP status code to return when the feature flag is disabled (default: 403)
   */
  statusCode?: number;
}

/**
 * Higher-order function that wraps an API route handler with feature flag check
 * 
 * @param flagName The name of the feature flag to check
 * @param handler The API route handler function
 * @param options Configuration options
 * @returns A new handler that checks the feature flag before executing the original handler
 * 
 * @example
 * // Create a route handler that requires a feature flag
 * export async function GET(request: NextRequest) {
 *   return requireFeatureFlagForRoute('api-feature', async (req) => {
 *     // This code only runs if the feature flag is enabled
 *     return NextResponse.json({ data: 'Success' });
 *   })(request);
 * }
 */
export const requireFeatureFlagForRoute = (
  flagName: string,
  handler: (request: NextRequest) => Promise<NextResponse> | NextResponse,
  options: RequireFeatureFlagOptions = {}
) => {
  const {
    errorMessage = `Feature flag "${flagName}" is not enabled`,
    statusCode = 403
  } = options;
  
  // Get base config from environment
  const defaultConfig = getConfig();
  
  // Merge with any provided overrides
  const mergedConfig: BridgeConfig = {
    ...defaultConfig,
    ...options.config
  };
  
  // Initialize the feature flag server
  const featureFlagServer = FeatureFlagServer.getInstance();
  featureFlagServer.init(mergedConfig);
  
  return async (request: NextRequest) => {
    try {
      // Check if the feature flag is enabled
      const isEnabled = await featureFlagServer.isFeatureEnabledServer(flagName, request);
      
      if (!isEnabled) {
        // Return an error if the feature flag is not enabled
        return NextResponse.json(
          { error: errorMessage },
          { status: statusCode }
        );
      }
      
      // Continue with the original handler if the flag is enabled
      return handler(request);
    } catch (error) {
      console.error(`Error checking feature flag ${flagName}:`, error);
      
      // Return a generic error if there's an issue checking the flag
      return NextResponse.json(
        { error: 'Error checking feature flag' },
        { status: 500 }
      );
    }
  };
}; 