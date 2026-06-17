import { NextRequest, NextResponse } from 'next/server';
import { BRIDGE_CONTEXT_HEADER } from '@nebulr-group/bridge-auth-core';
import { logger } from '../../shared/logger';
import { BridgeConfig } from '../../shared/types/config';
import { FeatureFlagServer } from './feature-flag.server';
import { getConfig } from './get-config';

interface RequireFeatureFlagOptions {
  /** Optional config overrides. */
  config?: Partial<BridgeConfig>;
  /** Custom error message when the flag is disabled. */
  errorMessage?: string;
  /** HTTP status when the flag is disabled (default: 403). */
  statusCode?: number;
}

/**
 * Higher-order function that wraps an API route handler with an FF 2.0 feature
 * flag check (local backend-mode eval via `FeatureFlagServer`). Export name kept
 * stable (§0 hard-rule 6).
 *
 * When the flag passes, the wrapped handler runs and the eval context is set on
 * the response's `x-bridge-context` header so any downstream Bridge backend the
 * handler proxies to shares the same identity (mirrors nestjs
 * BridgeContextInterceptor).
 *
 * @example
 * export async function GET(request: NextRequest) {
 *   return requireFeatureFlagForRoute('api-feature', async (req) => {
 *     return NextResponse.json({ data: 'Success' });
 *   })(request);
 * }
 */
export const requireFeatureFlagForRoute = (
  flagName: string,
  handler: (request: NextRequest) => Promise<NextResponse> | NextResponse,
  options: RequireFeatureFlagOptions = {},
) => {
  const { errorMessage = `Feature flag "${flagName}" is not enabled`, statusCode = 403 } = options;

  const mergedConfig: BridgeConfig = {
    ...getConfig(),
    ...options.config,
  };

  const featureFlagServer = FeatureFlagServer.getInstance();
  featureFlagServer.init(mergedConfig);

  return async (request: NextRequest) => {
    try {
      const isEnabled = await featureFlagServer.isFeatureEnabledServer(flagName, request);

      if (!isEnabled) {
        return NextResponse.json({ error: errorMessage }, { status: statusCode });
      }

      const response = await handler(request);

      // Propagate the eval context to downstream Bridge backends.
      const serialized = featureFlagServer.serializeContextForRequest(request);
      if (serialized && response instanceof NextResponse) {
        response.headers.set(BRIDGE_CONTEXT_HEADER, serialized);
      }
      return response;
    } catch (error) {
      logger.error(`Error checking feature flag ${flagName}:`, error);
      return NextResponse.json({ error: 'Error checking feature flag' }, { status: 500 });
    }
  };
};

export default requireFeatureFlagForRoute;
