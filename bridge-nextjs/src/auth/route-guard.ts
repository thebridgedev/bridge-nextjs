// Thin wrapper around auth-core's route guard — mirrors
// bridge-svelte/src/lib/auth/route-guard.ts.
//
// Used by middleware/server-side route handlers that need to evaluate route
// access rules consistently with the rest of the SDK.

import { getBridgeAuth } from '../core/bridge-instance';
import { dropFlagCache, guardCacheGeneration } from './guard-cache';

export type {
  FlagRequirement,
  NavigationDecision,
  RouteGuard,
  RouteGuardConfig,
  RouteRule,
} from '@nebulr-group/bridge-auth-core';

import type { NavigationDecision, RouteGuardConfig } from '@nebulr-group/bridge-auth-core';

// How many times a restriction check is re-run when the cache was invalidated
// underneath it (TBP-654). Bounded so a burst of invalidations cannot spin.
const MAX_FRESH_READS = 3;

export function createRouteGuard(
  config: RouteGuardConfig,
  flagsReady?: Promise<void>
) {
  const guard = getBridgeAuth().createRouteGuard(config);

  // TBP-654 — a restriction check reads the flag cache. If the cache was
  // invalidated while the check was in flight (plan change, token refresh),
  // the answer may predate the change AND has just been written back into the
  // cache. Discard it and ask again.
  async function checkRestrictionsFresh(pathname: string): Promise<string | null> {
    for (let attempt = 1; ; attempt++) {
      const generation = guardCacheGeneration();
      const redirectTo = await guard.checkRouteRestrictions(pathname);
      if (generation === guardCacheGeneration()) return redirectTo;
      dropFlagCache();
      if (attempt >= MAX_FRESH_READS) return redirectTo;
    }
  }

  return {
    ...guard,
    async checkRouteRestrictions(pathname: string): Promise<string | null> {
      await flagsReady;
      return checkRestrictionsFresh(pathname);
    },
    async getNavigationDecision(pathname: string, attempted?: string): Promise<NavigationDecision> {
      if (guard.shouldRedirectToLogin(pathname)) {
        // TBP-629 — this branch short-circuits before flagsReady on purpose (an
        // unauthenticated visitor needs no flag evaluation), which is exactly
        // why `attempted` has to be threaded through here too. The wrapper
        // rebuilds the decision by hand and would otherwise silently drop any
        // argument auth-core's version learned to accept.
        const returnTo = guard.resolveReturnTo(attempted ?? pathname);
        return {
          type: 'login',
          loginUrl: guard.getLoginRedirect(),
          ...(returnTo ? { returnTo } : {}),
        };
      }
      await flagsReady;
      const redirectTo = await checkRestrictionsFresh(pathname);
      if (redirectTo) {
        return { type: 'redirect', to: redirectTo };
      }
      return { type: 'allow' };
    },
  };
}
