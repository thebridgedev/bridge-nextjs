// Thin wrapper around auth-core's route guard — mirrors
// bridge-svelte/src/lib/auth/route-guard.ts.
//
// Used by middleware/server-side route handlers that need to evaluate route
// access rules consistently with the rest of the SDK.

import { getBridgeAuth } from '../core/bridge-instance';

export type {
  FlagRequirement,
  NavigationDecision,
  RouteGuard,
  RouteGuardConfig,
  RouteRule,
} from '@nebulr-group/bridge-auth-core';

import type { RouteGuardConfig } from '@nebulr-group/bridge-auth-core';

export function createRouteGuard(
  config: RouteGuardConfig,
  flagsReady?: Promise<void>
) {
  const guard = getBridgeAuth().createRouteGuard(config);
  if (!flagsReady) return guard;

  return {
    ...guard,
    async checkRouteRestrictions(pathname: string): Promise<string | null> {
      await flagsReady;
      return guard.checkRouteRestrictions(pathname);
    },
    async getNavigationDecision(pathname: string) {
      if (guard.shouldRedirectToLogin(pathname)) {
        return { type: 'login' as const, loginUrl: guard.getLoginRedirect() };
      }
      await flagsReady;
      const redirectTo = await guard.checkRouteRestrictions(pathname);
      if (redirectTo) {
        return { type: 'redirect' as const, to: redirectTo };
      }
      return { type: 'allow' as const };
    },
  };
}
