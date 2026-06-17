import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { JSX, ReactNode } from 'react';
import { NextRequest } from 'next/server';
import { BridgeConfig } from '../../shared/types/config';
import { logger } from '../../shared/logger';
import { getConfig } from '../utils/get-config';
import { FeatureFlagServer } from '../utils/feature-flag.server';

interface ServerFeatureFlagProps {
  /** The flag key to check. */
  flagName: string;
  /** Content to render if the feature flag is enabled. */
  children: ReactNode;
  /** Optional content to render if the feature flag is disabled. */
  fallback?: ReactNode;
  /** Reverse the condition (show content when flag is disabled). */
  negate?: boolean;
  /** Optional redirect URL if the flag is disabled (and no fallback is provided). */
  redirectTo?: string;
  /** Config override (optional). */
  config?: Partial<BridgeConfig>;
  /**
   * Legacy prop, accepted for source-compat — there is no per-flag REST eval in
   * FF 2.0; freshness is governed by the server pull-cache TTL. Ignored.
   */
  forceLive?: boolean;
}

/**
 * Server Component for conditional rendering based on feature flags (FF 2.0).
 *
 * Evaluates locally via the backend-mode `FeatureFlagServer` (BridgeFlags +
 * BridgePullCache), building the eval context from the request's token claims
 * read via `next/headers` `cookies()`. Export name kept stable (§0 hard-rule 6).
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
 */
export async function ServerFeatureFlag({
  flagName,
  children,
  fallback,
  negate = false,
  redirectTo,
  config: configOverride,
}: ServerFeatureFlagProps): Promise<JSX.Element | null> {
  const mergedConfig: BridgeConfig = {
    ...getConfig(),
    ...configOverride,
  };

  try {
    if (!mergedConfig.appId) {
      logger.error('ServerFeatureFlag - appId is required for feature flag checking');
      return (fallback as JSX.Element) || null;
    }

    // Build a minimal request carrying the cookie header — the only thing the
    // FeatureFlagServer reads to derive token claims. App Router server
    // components access cookies through `next/headers`.
    const cookieStore = await cookies();
    const cookieHeader = cookieStore
      .getAll()
      .map((c) => `${c.name}=${c.value}`)
      .join('; ');
    const request = new NextRequest('http://localhost/', {
      headers: cookieHeader ? { cookie: cookieHeader } : {},
    });

    const featureFlagServer = FeatureFlagServer.getInstance();
    featureFlagServer.init(mergedConfig);

    const enabled = await featureFlagServer.isFeatureEnabledServer(flagName, request);
    const shouldRender = negate ? !enabled : enabled;

    if (shouldRender) {
      return <>{children}</> as JSX.Element;
    }
    if (redirectTo) {
      redirect(redirectTo);
    }
    return (fallback as JSX.Element) || null;
  } catch (error) {
    logger.error('ServerFeatureFlag - Error:', error);
    if (redirectTo) {
      redirect(redirectTo);
    }
    return (fallback as JSX.Element) || null;
  }
}
