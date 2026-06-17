// Server-side exports only — Feature Flags 2.0 (backend-mode eval) + auth.
export { createBridgeCallbackRoute } from './server/callback-route';
export { ServerFeatureFlag } from './server/components/ServerFeatureFlag';
export { withAuth } from './server/middleware/auth-middleware';
export {
  requireFeatureFlag,
  withFeatureFlag,
  withFeatureFlags,
  requireApiFeatureFlag,
  type FeatureFlagProtection,
  type WithFeatureFlagOptions,
} from './server/middleware/feature-flag-middleware';
export { withBridgeAuth } from './server/middleware/with-bridge-auth';
export { FeatureFlagServer } from './server/utils/feature-flag.server';
export { getConfig } from './server/utils/get-config';
export { initServices } from './server/utils/init-services';
export { requireFeatureFlagForRoute } from './server/utils/route-handlers';
export { TokenServiceServer } from './server/utils/token-service.server';

// FF 2.0 context propagation — serialize the eval context into x-bridge-context
// so downstream nestjs/express services share identity. Re-exported from
// auth-core so server consumers don't need a direct dependency.
export {
  BRIDGE_CONTEXT_HEADER,
  serializeContext,
  deserializeContext,
  serverInstanceId,
} from '@nebulr-group/bridge-auth-core';
export type { EvalContext, CachedFlag, FlagEvalResult } from '@nebulr-group/bridge-auth-core';
