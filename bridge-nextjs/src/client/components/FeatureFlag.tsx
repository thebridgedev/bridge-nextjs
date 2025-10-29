'use client';

import { FC, ReactNode } from 'react';
import useFeatureFlag from '../hooks/use-feature-flag';

interface FeatureFlagProps {
  /**
   * The name of the feature flag to check
   */
  flagName: string;
  
  /**
   * Content to show when feature is enabled
   */
  children: ReactNode;
  
  /**
   * Content to show when feature is disabled (optional)
   */
  fallback?: ReactNode;
  
  /**
   * If true, the flag's value will be inverted
   * (show children when flag is disabled, show fallback when flag is enabled)
   */
  negate?: boolean;
  
  /**
   * If true, force a live check of the feature flag
   */
  forceLive?: boolean;
}

/**
 * Component for conditionally rendering content based on a feature flag
 * 
 * @example
 * // Basic usage
 * <FeatureFlag flagName="premium-feature">
 *   <PremiumFeature />
 * </FeatureFlag>
 * 
 * @example
 * // With fallback content
 * <FeatureFlag flagName="new-ui" fallback={<LegacyUI />}>
 *   <NewUI />
 * </FeatureFlag>
 * 
 * @example
 * // Negating the flag
 * <FeatureFlag flagName="maintenance-mode" negate>
 *   <NormalContent />
 * </FeatureFlag>
 */
export const FeatureFlag: FC<FeatureFlagProps> = ({
  flagName,
  children,
  fallback = null,
  negate = false,
  forceLive = false
}) => {
  const isEnabled = useFeatureFlag(flagName, { forceLive });
  const shouldRender = negate ? !isEnabled : isEnabled;

  return shouldRender ? <>{children}</> : <>{fallback}</>;
};

export default FeatureFlag; 