import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { AuthService } from '../../shared/services/auth.service';
import { BridgeConfig } from '../../shared/types/config';
import { FeatureFlagServer } from './feature-flag.server';
import { getConfig } from './get-config';
import { TokenServiceServer } from './token-service.server';

/**
 * Initialize services with configuration from environment variables
 * 
 * @param config Optional configuration to use instead of getting it from environment variables
 * @returns An object containing initialized services
 */
export async function initServices(config?: BridgeConfig) {
  const configToUse = config || getConfig();
  
  // Initialize services
  const tokenService = TokenServiceServer.getInstance();
  tokenService.init(configToUse);
  
  const authService = AuthService.getInstance();
  authService.init(configToUse);

  const featureFlagServer = FeatureFlagServer.getInstance();
  featureFlagServer.init(configToUse);
  
  // Get tokens from cookies if available
  const cookieStore = await cookies();
  const accessToken = cookieStore.get('bridge_access_token')?.value;
  const refreshToken = cookieStore.get('bridge_refresh_token')?.value;
  const idToken = cookieStore.get('bridge_id_token')?.value;
  
  // Set tokens if available
  if (accessToken) {
    // Create a dummy response for token setting
    const response = NextResponse.next();
    tokenService.setTokensServer({
      accessToken,
      refreshToken: refreshToken || '',
      idToken: idToken || ''
    }, response);
  }
  
  return {
    config: configToUse,
    tokenService,
    authService,
    featureFlagServer,
    isAuthenticated: !!accessToken
  };
} 