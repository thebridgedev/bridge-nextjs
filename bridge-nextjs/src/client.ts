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

// ── Reactive hooks (auth-core-backed) ─────────────────────────────────────────
export { useAppConfig } from './client/hooks/use-app-config';
export { useAuth } from './client/hooks/use-auth';
export { useAuthState } from './client/hooks/use-auth-state';
export { useBridgeReady } from './client/hooks/use-bridge-ready';
export { useBridgeTokens } from './client/hooks/use-bridge-tokens';
export { default as useFeatureFlag } from './client/hooks/use-feature-flag';
export { useFlagsStore } from './client/hooks/use-flags-store';
export { useHasMultiTenantAccess } from './client/hooks/use-has-multi-tenant-access';
export { useIsOnboarded } from './client/hooks/use-is-onboarded';
export { useProfile } from './client/hooks/use-profile';
export { useSubscription } from './client/hooks/use-subscription';
export { useTenantUsers } from './client/hooks/use-tenant-users';

// ── Feature flags (auth-core wrapper, mirrors bridge-svelte) ──────────────────
export { featureFlags, isFeatureEnabled, loadFeatureFlags } from './shared/feature-flag';

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
