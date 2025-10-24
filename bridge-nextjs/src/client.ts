// Client-side exports only
// Components
export { Login } from './client/components/auth/Login';
export { ProtectedRoute } from './client/components/auth/ProtectedRoute';
export { TokenStatus } from './client/components/auth/TokenStatus';
export { default as FeatureFlag } from './client/components/FeatureFlag';
export { Team } from './client/components/team/Team';

// Client-side hooks
export { useAuth } from './client/hooks/use-auth';
export { default as useFeatureFlag } from './client/hooks/use-feature-flag';
export { useBridgeConfig } from './client/hooks/use-bridge-config';
export { useProfile } from './client/hooks/use-profile';
export { useTeamManagement } from './client/hooks/use-team-management';
export { useFeatureFlagsContext } from './client/providers/feature-flags.provider';
export { useTokenStore } from './shared/services/token.service';

// Client-side providers
export { FeatureFlagsProvider } from './client/providers/feature-flags.provider';
export { BridgeConfigProvider } from './client/providers/bridge-config.provider';
export { BridgeProvider } from './client/providers/bridge-provider';
export { BridgeTokenProvider } from './client/providers/bridge-token.provider';

// Remove direct exports of service functions that should only be used through hooks

