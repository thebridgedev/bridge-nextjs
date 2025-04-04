import { NextRequest, NextResponse } from 'next/server';
import { NblocksConfig } from '../../shared/types/config';
import { FeatureFlagServer } from '../utils/feature-flag.server';
import { getConfig } from '../utils/get-config';

export interface FeatureFlagProtection {
  flag: string;
  paths: string[];
  redirectTo?: string;
  config?: Partial<NblocksConfig>;
  responseType?: 'redirect' | 'error';
  errorStatus?: number;
  errorMessage?: string;
}

export interface WithFeatureFlagOptions {
  config?: Partial<NblocksConfig> & {
    redirectRoute?: string;
  };
  fallbackPaths?: string[];
  responseType?: 'redirect' | 'error';
  errorStatus?: number;
  errorMessage?: string;
}

/**
 * Determines if a request is an API request
 * @param request The NextRequest object
 * @returns boolean indicating if the request is an API request
 */
function isApiRequest(request: NextRequest): boolean {
  const { pathname } = request.nextUrl;
  
  // Check if the path starts with /api/
  if (pathname.startsWith('/api/')) {
    return true;
  }
  
  // Check if the request accepts JSON
  const acceptHeader = request.headers.get('accept');
  if (acceptHeader && acceptHeader.includes('application/json')) {
    return true;
  }
  
  return false;
}

/**
 * Creates a middleware function that protects multiple routes with feature flags
 * @param protections Array of feature flag protections
 * @returns Middleware function
 */
export function withFeatureFlags(protections: FeatureFlagProtection[]) {
  // Initialize feature flag server with default config
  const defaultConfig = getConfig();
  const featureFlagServer = FeatureFlagServer.getInstance();
  featureFlagServer.init(defaultConfig);

  return async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // Find any protection that matches the current path
    const matchingProtection = protections.find(protection => 
      protection.paths.some(path => {
        // Handle wildcard paths
        if (path.endsWith('/*')) {
          const basePath = path.slice(0, -1);
          return pathname.startsWith(basePath);
        }
        // Exact match
        return pathname === path;
      })
    );

    if (!matchingProtection) {
      return NextResponse.next();
    }

    // Initialize feature flag server with protection-specific config if provided
    if (matchingProtection.config) {
      const mergedConfig: NblocksConfig = {
        ...defaultConfig,
        ...matchingProtection.config,
        appId: matchingProtection.config.appId || defaultConfig.appId || '',
      };
      featureFlagServer.init(mergedConfig);
    }

    // Check if the feature flag is enabled
    const isEnabled = await featureFlagServer.isFeatureEnabledServer(matchingProtection.flag, request);

    if (!isEnabled) {
      // Determine if this is an API request
      const isApi = isApiRequest(request);
      
      // Get response type from protection or default to 'redirect' for backward compatibility
      const responseType = matchingProtection.responseType || 'redirect';
      
      // For API requests or when responseType is 'error', return an error response
      if (isApi || responseType === 'error') {
        const status = matchingProtection.errorStatus || 403;
        const message = matchingProtection.errorMessage || `Feature flag "${matchingProtection.flag}" is not enabled`;
        
        console.info(`Feature flag "${matchingProtection.flag}" not enabled, returning ${status} error`);
        return NextResponse.json(
          { error: message },
          { status }
        );
      }
      
      // For page requests with redirect response type, redirect to the specified route
      const redirectRoute = matchingProtection.redirectTo || defaultConfig.defaultRedirectRoute || '/';
      console.info(`Feature flag "${matchingProtection.flag}" not enabled, redirecting to ${redirectRoute}`);
      const redirectUrl = new URL(redirectRoute, request.url);
      return NextResponse.redirect(redirectUrl);
    }

    return NextResponse.next();
  };
}

// Keep the old functions for backward compatibility
export function withFeatureFlag(flagName: string, options: WithFeatureFlagOptions = {}) {
  return withFeatureFlags([{
    flag: flagName,
    paths: ['/'], // Default path, will be overridden by the matcher
    redirectTo: options.config?.redirectRoute,
    config: options.config,
    responseType: options.responseType,
    errorStatus: options.errorStatus,
    errorMessage: options.errorMessage
  }]);
}

export function requireFeatureFlag(flagName: string, redirectUrl: string = '/') {
  return withFeatureFlag(flagName, {
    config: {
      redirectRoute: redirectUrl
    }
  });
}

/**
 * Creates a middleware function that protects API routes with feature flags
 * @param flagName The feature flag name
 * @param options Additional options
 * @returns Middleware function
 */
export function requireApiFeatureFlag(
  flagName: string, 
  options: { 
    errorStatus?: number;
    errorMessage?: string;
    config?: Partial<NblocksConfig>;
  } = {}
) {
  return withFeatureFlag(flagName, {
    responseType: 'error',
    errorStatus: options.errorStatus || 403,
    errorMessage: options.errorMessage || `Feature flag "${flagName}" is not enabled`,
    config: options.config
  });
}

export default requireFeatureFlag; 