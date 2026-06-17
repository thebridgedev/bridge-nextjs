// bridge-nextjs/flags — internal barrel for the Feature Flags 2.0 client surface.
//
// NOTE on entry points (§6.2 locked decision 4): FF 2.0 is FOLDED INTO the
// existing `./client` entry — there is NO `./flags` subpath export. This file is
// an internal aggregation point that `src/client.ts` re-exports from; consumers
// import everything from `@nebulr-group/bridge-nextjs/client`. The shared
// `src/flags/registry.ts` is plain TS and is imported by both the client surface
// (here) and the server surface (`src/server/utils/feature-flag.server.ts`).

// Bootstrap + browser storage
export {
  createBridgeFlags,
  BrowserIdentityStorage,
  type CreateBridgeFlagsConfig,
  type BridgeFlagsBundle,
} from './bootstrap';

// Non-React registry surface — safe in any TS context (server, tests, plain TS)
export {
  evaluateFlag,
  setBridgeFlagsInstance,
  getBridgeFlagsInstance,
  notifyFlagChanged,
  notifyAllFlagsChanged,
  subscribeToFlagChanges,
} from './registry';

// React reactive helpers — pull in hooks, only safe inside client components.
export { useFlag, flagStore, type FlagStore } from './use-flag';

// Component
export { FeatureFlag, default as FeatureFlagComponent, type FeatureFlagProps } from '../client/components/FeatureFlag';

// Reactive realtime connection status (subscribe in components to show
// offline indicators, retry banners, etc.).
export { realtimeStatus, useRealtimeStatus } from './realtime-status';

// Auth-core re-exports — consumers can stay on the `./client` path without
// adding a direct dependency on `@nebulr-group/bridge-auth-core`. Mirrors
// bridge-svelte's flags/index.ts re-export list.
export {
  BridgeFlags,
  MemoryIdentityStorage,
  attachIdentity,
  generateAnonymousId,
  BRIDGE_CONTEXT_HEADER,
  serializeContext,
  deserializeContext,
  serverInstanceId,
} from '@nebulr-group/bridge-auth-core';

export type {
  CachedFlag,
  FlagValueType,
  FlagEvalResult,
  EvalTelemetry,
  DiscoveryTelemetry,
  BridgeFlagsHooks,
  DeclaredAttributeType,
  AttributeDeclaration,
  BridgeFlagsMode,
  EvalContext,
  IdentityStorage,
  AnonymousTrackingMode,
  BridgeIdentity,
  RealtimeMessage,
  ConnectionState,
} from '@nebulr-group/bridge-auth-core';
