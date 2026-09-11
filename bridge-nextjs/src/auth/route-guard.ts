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
    async getNavigationDecision(pathname: string, attempted?: string) {
      if (guard.shouldRedirectToLogin(pathname)) {
        // TBP-629 — this branch short-circuits before flagsReady on purpose (an
        // unauthenticated visitor needs no flag evaluation), which is exactly
        // why `attempted` has to be threaded through here too. The wrapper
        // rebuilds the decision by hand and would otherwise silently drop any
        // argument auth-core's version learned to accept.
        const returnTo = guard.resolveReturnTo(attempted ?? pathname);
        return {
          type: 'login' as const,
          loginUrl: guard.getLoginRedirect(),
          ...(returnTo ? { returnTo } : {}),
        };
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
