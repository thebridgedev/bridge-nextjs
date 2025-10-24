import { redirect } from 'next/navigation';
import { JSX, ReactNode } from 'react';
import { isFeatureEnabled } from '../../shared/services/feature-flag.service';
import { NblocksConfig } from '../../shared/types/config';
import { getConfig } from '../utils/get-config';
import { initServices } from '../utils/init-services';

interface ServerFeatureFlagProps {
  /**
   * The name of the feature flag to check
   */
  flagName: string;
  
  /**
   * Content to render if the feature flag is enabled
   */
  children: ReactNode;
  
  /**
   * Optional content to render if the feature flag is disabled
   */
  fallback?: ReactNode;
  
  /**
   * Reverse the condition (show content when flag is disabled)
   */
  negate?: boolean;
  
  /**
   * Optional redirect URL if the feature flag is disabled (and no fallback is provided)
   */
  redirectTo?: string;
  
  /**
   * Config override (optional)
   */
  config?: Partial<NblocksConfig>;
  
  /**
   * Access token (for testing or explicit passing)
   */
  accessToken?: string;
  
  /**
   * If true, force a live check of the feature flag (bypass cache)
   */
  forceLive?: boolean;
}


/**
 * Server Component for conditional rendering based on feature flags
 * 
 * @example
 * <ServerFeatureFlag flagName="premium-feature" fallback={<UpgradeBanner />}>
 *   <PremiumFeature />
 * </ServerFeatureFlag>
 * 
 * @example
 * <ServerFeatureFlag flagName="maintenance-mode" negate redirectTo="/">
 *   <NormalContent />
 * </ServerFeatureFlag>
 * 
 * @example
 * <ServerFeatureFlag flagName="beta-feature" forceLive={true}>
 *   <BetaFeature />
 * </ServerFeatureFlag>
 */
export async function ServerFeatureFlag({
  flagName,
  children,
  fallback,
  negate = false,
  redirectTo,
  config: configOverride,
  accessToken: explicitToken,
  forceLive = false
}: ServerFeatureFlagProps): Promise<JSX.Element | null> {
  // Get the default config and apply any overrides
  const defaultConfig = getConfig();
  const mergedConfig: NblocksConfig = {
    ...defaultConfig,
    ...configOverride
  };
  
  // Use explicitly provided token or try to get it from services
  let accessToken = explicitToken;
  
  try {
    // Try to initialize services and get authentication status
    // This is a safer approach that avoids direct cookie access
    const services = await initServices(mergedConfig);
    
    // If no explicit token and not authenticated, show fallback or redirect
    if (!explicitToken && !services.isAuthenticated) {
      if (redirectTo) {
        redirect(redirectTo);
      }
      return (fallback as JSX.Element) || null;
    }
    
    // If we have an explicit token, use it
    // Otherwise, we'll rely on the authenticated state from initServices
    // and the feature flag service will handle token retrieval
    
    // Check if the feature flag is enabled
    if (!mergedConfig.appId) {
      console.error('appId is required for feature flag checking');
      return (fallback as JSX.Element) || null;
    }
    
    const enabled = await isFeatureEnabled(
      flagName, 
      mergedConfig.appId,
      explicitToken || '',
      forceLive
    );
    
    const shouldRender = negate ? !enabled : enabled;
    
    if (shouldRender) {
      return <>{children}</> as JSX.Element;
    } else if (redirectTo) {
      redirect(redirectTo);
    } else {
      return (fallback as JSX.Element) || null;
    }
  } catch (error) {
    console.error(`Error in ServerFeatureFlag:`, error);
    
    if (redirectTo) {
      redirect(redirectTo);
    }
    return (fallback as JSX.Element) || null;
  }
} 