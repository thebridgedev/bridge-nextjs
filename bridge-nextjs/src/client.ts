// Client-side exports — auth-core-backed, svelte-parity.
//
// Mirrors bridge-svelte's `src/lib/index.ts` shape. No legacy fallback layer.

// ── Bridge core (singleton + ready gate + subscription) ───────────────────────
export {
  auth,
  ensureAppConfig,
  getBridgeAuth,
  initBridge,
  loadSubscription,
  markReady,
  useBridgeStore,
  waitForBridge,
  type SubscriptionState,
} from './core/bridge-instance';

// ── Provider ──────────────────────────────────────────────────────────────────
export { BridgeProvider } from './client/providers/bridge-provider';

// ── Unified bridge surface (Live Channel Unification) ─────────────────────────
// Single scoped read surface: `bridge.app` / `bridge.tenant` / `bridge.user` /
// `bridge.attributes` / `bridge.events`. Populated from `session.snapshot` on the
// live channel. Mirrors bridge-svelte's `bridge` export.
export { bridge } from './core/bridge';
export { useBridge } from './client/hooks/use-bridge';
export type {
  BridgeSurface,
  BridgeAppSurface,
  BridgeTenantSurface,
  BridgeReadable,
} from './core/bridge';
export type { LazySlice } from './core/lazy-slice';
export type {
  BrandingSnapshot,
  SubscriptionSnapshot,
  UserSnapshot,
  SessionSnapshotData,
} from './core/snapshot-stores';
export {
  BridgeEventsDispatcher,
  type BridgeEventHandlers,
} from './core/events';
// Reactive realtime connection status — surface offline indicators / retry banners.
export { realtimeStatus, useRealtimeStatus } from './core/realtime-status';
export type { ConnectionState } from '@nebulr-group/bridge-auth-core';

// ── Reactive hooks (auth-core-backed) ─────────────────────────────────────────
export { useAppConfig } from './client/hooks/use-app-config';
export { useAuth } from './client/hooks/use-auth';
export { useAuthState } from './client/hooks/use-auth-state';
export { useBridgeReady } from './client/hooks/use-bridge-ready';
export { useBridgeTokens } from './client/hooks/use-bridge-tokens';
export { useHasMultiTenantAccess } from './client/hooks/use-has-multi-tenant-access';
export { useIsOnboarded } from './client/hooks/use-is-onboarded';
export { useProfile } from './client/hooks/use-profile';
export { useSubscription } from './client/hooks/use-subscription';
export { useTenantUsers } from './client/hooks/use-tenant-users';

// ── Feature Flags 2.0 (folded into ./client — no separate ./flags subpath) ────
// React reactive access + declarative component + advanced bootstrap + registry
// helpers + auth-core FF 2.0 re-exports. Mirrors bridge-svelte's flags barrel.
export {
  // Bootstrap + browser storage
  createBridgeFlags,
  BrowserIdentityStorage,
  type CreateBridgeFlagsConfig,
  type BridgeFlagsBundle,
  // Reactive helpers
  useFlag,
  flagStore,
  type FlagStore,
  // Component props type (the component itself is exported below alongside the
  // other client components)
  type FeatureFlagProps,
  // Non-React registry surface
  evaluateFlag,
  setBridgeFlagsInstance,
  getBridgeFlagsInstance,
  notifyFlagChanged,
  notifyAllFlagsChanged,
  subscribeToFlagChanges,
  // Auth-core FF 2.0 re-exports
  BridgeFlags,
  MemoryIdentityStorage,
  attachIdentity,
  generateAnonymousId,
  BRIDGE_CONTEXT_HEADER,
  serializeContext,
  deserializeContext,
  serverInstanceId,
  type CachedFlag,
  type FlagValueType,
  type FlagEvalResult,
  type EvalTelemetry,
  type DiscoveryTelemetry,
  type BridgeFlagsHooks,
  type DeclaredAttributeType,
  type AttributeDeclaration,
  type BridgeFlagsMode,
  type EvalContext,
  type IdentityStorage,
  type AnonymousTrackingMode,
  type BridgeIdentity,
  type RealtimeMessage,
} from './flags';

// ── Route guards (auth-core wrapper, mirrors bridge-svelte) ───────────────────
export {
  createRouteGuard,
  type FlagRequirement,
  type NavigationDecision,
  type RouteGuard,
  type RouteGuardConfig,
  type RouteRule,
} from './auth/route-guard';

// ── Logger ────────────────────────────────────────────────────────────────────
export { logger, setLoggerDebug } from './shared/logger';

// ── Config types ──────────────────────────────────────────────────────────────
export type { BridgeConfig } from './shared/types/config';

// ── Components ────────────────────────────────────────────────────────────────
export { default as FeatureFlag } from './client/components/FeatureFlag';
export { default as ProfileName } from './client/components/ProfileName';
export { ProtectedRoute } from './client/components/auth/ProtectedRoute';

// ── Team (SDK panel) ──────────────────────────────────────────────────────────
export { TeamAddUserDialog } from './client/components/team/TeamAddUserDialog';
export { TeamConfirmDialog } from './client/components/team/TeamConfirmDialog';
export { TeamEditUserDialog } from './client/components/team/TeamEditUserDialog';
export { TeamManagementPanel } from './client/components/team/TeamManagementPanel';
export { TeamProfileForm } from './client/components/team/TeamProfileForm';
export { TeamUserActionsMenu } from './client/components/team/TeamUserActionsMenu';
export { TeamUserList } from './client/components/team/TeamUserList';
export { TeamWorkspaceForm } from './client/components/team/TeamWorkspaceForm';

// ── SDK Auth ──────────────────────────────────────────────────────────────────
export { ForgotPassword } from './client/components/sdk-auth/ForgotPassword';
export { LoginForm } from './client/components/sdk-auth/LoginForm';
export { MagicLink } from './client/components/sdk-auth/MagicLink';
export { MfaChallenge } from './client/components/sdk-auth/MfaChallenge';
export { MfaSetup } from './client/components/sdk-auth/MfaSetup';
export { PasskeyLogin } from './client/components/sdk-auth/PasskeyLogin';
export { PasskeyRequestSetupLink } from './client/components/sdk-auth/PasskeyRequestSetupLink';
export { PasskeySetup } from './client/components/sdk-auth/PasskeySetup';
export { SignupForm } from './client/components/sdk-auth/SignupForm';
export { SsoButton } from './client/components/sdk-auth/SsoButton';
export { SsoProviderIcon } from './client/components/sdk-auth/SsoProviderIcon';
export { TenantSelector } from './client/components/sdk-auth/TenantSelector';
export { WorkspaceSelector } from './client/components/sdk-auth/WorkspaceSelector';

// ── SDK Auth shared primitives ────────────────────────────────────────────────
export { Alert } from './client/components/sdk-auth/shared/Alert';
export { AuthFormWrapper } from './client/components/sdk-auth/shared/AuthFormWrapper';
export { Spinner } from './client/components/sdk-auth/shared/Spinner';

// ── Subscription ──────────────────────────────────────────────────────────────
export { PlanSelector } from './client/components/subscription/PlanSelector';

// ── Billing 2.0 — canonical-model drop-ins (TBP-248/263) ──────────────────────
// Parallel to PlanSelector (Stripe-direct path); these coexist until REF-1
// (post-feature) consolidates them. Mirrors bridge-svelte's index.ts.
export {
  BridgeSubscriptionStatus,
  type BridgeSubscriptionStatusProps,
} from './client/components/subscription/BridgeSubscriptionStatus';
export {
  BridgeBillingNotice,
  type BridgeBillingNoticeProps,
} from './client/components/subscription/BridgeBillingNotice';
export {
  BridgePaywall,
  type BridgePaywallProps,
} from './client/components/subscription/BridgePaywall';
export {
  BridgeQuotaBanner,
  type BridgeQuotaBannerProps,
} from './client/components/subscription/BridgeQuotaBanner';
// Generic BridgeReadable → React adapter the Billing 2.0 components are built on.
export {
  useBridgeReadable,
  useBridgeSnapshot,
  type ReadableLike,
} from './client/hooks/use-bridge-readable';
// Auth-core Billing 2.0 surface re-exports — the reactive billing factory + the
// pure notice-state derivations + their types. Consumers wiring custom billing
// UI (or the realtime provider wiring) read these. Mirrors the auth-core surface
// bridge-svelte's components rely on.
export {
  useBridge as useBridgeBilling,
  deriveNoticeState,
  deriveSeverity,
} from '@nebulr-group/bridge-auth-core';
export type {
  UseBridgeApi,
  UseBridgeEntitlementsApi,
  BillingEventHandlers,
  BillingGateState,
  BillingSubscriptionStatus as BillingSubscriptionStatusType,
  BillingSeverity,
  PastDueReason,
  BillingPlanRef,
  BillingSubscriptionState,
  BillingSubscriptionSnapshot,
  BillingNoticeState,
  BillingLockedPayload,
  MountOptions,
  QuotaSnapshot,
  EntitlementSnapshot,
} from '@nebulr-group/bridge-auth-core';

// ── Developer ─────────────────────────────────────────────────────────────────
export { ApiTokenManagement } from './client/components/developer/ApiTokenManagement';

// ── Conversion tracking (Reddit / GA4 via GTM dataLayer) ─────────────────────
export {
  configureRedditTracking,
  pushConversionEvent,
  pushRedditEvent,
  type PushConversionEventOptions,
  type RedditConversionEvent,
  type RedditEcommerce,
  type RedditEcommerceItem,
  type RedditTrackingGate,
  type RedditUserData,
} from './client/tracking/reddit-tracking';
export { sha256Email } from './client/tracking/pii-hashing';

// ── Auth-core type re-exports for advanced consumers ──────────────────────────
export type {
  AppConfig,
  AuthConfigResponse,
  AuthResult,
  AuthState,
  BridgeAuthConfig,
  BridgeAuthEventName,
  BridgeAuthEvents,
  FederationConnection,
  MagicLinkResult,
  MfaResult,
  PasskeyAuthOptions,
  PasskeyRegistrationOptions,
  PasskeyVerificationResult,
  Plan,
  PriceOfferSdk,
  Profile,
  SignupResult,
  SsoOptions,
  SsoResult,
  SubscriptionStatus,
  TeamProfile,
  TeamProfileUpdateInput,
  TeamUser,
  TeamUserListResult,
  TeamUserUpdateInput,
  TeamWorkspace,
  TeamWorkspaceUpdateInput,
  TenantUser,
  TokenSet,
  Workspace,
} from '@nebulr-group/bridge-auth-core';
export {
  ApiTokenService,
  BridgeAuth,
  BridgeAuthError,
  HttpError,
  TeamService,
} from '@nebulr-group/bridge-auth-core';
