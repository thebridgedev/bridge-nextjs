// Thin wrapper around auth-core's route guard — mirrors
// bridge-svelte/src/lib/auth/route-guard.ts.
//
// Used by middleware/server-side route handlers that need to evaluate route
// access rules consistently with the rest of the SDK.

import { getBridgeAuth } from '../core/bridge-instance';
import { logger } from '../shared/logger';
import {
  AUTHORIZATION_CHANGE_WAIT_MS,
  dropFlagCache,
  guardCacheGeneration,
  settleAuthorizationChange,
} from './guard-cache';

export type {
  FlagRequirement,
  NavigationDecision,
  RouteGuard,
  RouteGuardConfig,
  RouteRule,
} from '@nebulr-group/bridge-auth-core';

import type {
  NavigationDecision,
  RouteGuardConfig,
  RouteRestriction,
  RouteRule,
} from '@nebulr-group/bridge-auth-core';

export type { RouteRestriction } from '@nebulr-group/bridge-auth-core';

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
  //
  // Each read first waits (bounded by `deadline`) for a token refresh that a
  // plan / entitlements / user-state change started: the page shows the new
  // plan a few hundred ms before the token carrying it lands, and a verdict
  // taken in between would be evaluated with the old one.
  async function checkRestrictionsFresh(pathname: string, deadline: number): Promise<RouteRestriction | null> {
    for (let attempt = 1; ; attempt++) {
      await settleAuthorizationChange(deadline);
      const generation = guardCacheGeneration();
      const restriction = await readRestriction(pathname);
      if (generation === guardCacheGeneration()) return restriction;
      dropFlagCache();
      if (attempt >= MAX_FRESH_READS) return restriction;
    }
  }

  // TBP-756 — the restriction with, for a feature flag, why it is off
  // (`reason: 'plan'` means an upgrade alone opens the route). A stand-in guard
  // without auth-core 0.8's `checkRouteRestriction` gives the bare target.
  async function readRestriction(pathname: string): Promise<RouteRestriction | null> {
    if (typeof guard.checkRouteRestriction === 'function') return guard.checkRouteRestriction(pathname);
    const to = await guard.checkRouteRestrictions(pathname);
    return to ? { to } : null;
  }

  function loginDecision(pathname: string, attempted?: string): NavigationDecision {
    // TBP-629 — the attempted target (path + query) rides along on every login
    // decision, including the fail-closed ones below.
    let returnTo: string | null = null;
    try {
      returnTo = guard.resolveReturnTo(attempted ?? pathname);
    } catch {
      returnTo = null;
    }
    let loginUrl = '';
    try {
      loginUrl = guard.getLoginRedirect();
    } catch {
      // SDK mode never reads loginUrl; hosted mode rebuilds it at redirect time.
    }
    return { type: 'login', loginUrl, ...(returnTo ? { returnTo } : {}) };
  }

  // TBP-653 — the guard could not reach a decision (a network error on a flag
  // check, malformed config, an exception anywhere in the chain). That must
  // never let a restricted route through, and must not surface as a rejected
  // promise a consumer may treat as "no objection":
  //   - a public route with no flag/billing requirement stays reachable;
  //   - a signed-out visitor is sent to login;
  //   - a signed-in user is treated as failing the route's requirement and
  //     sent where the rule says a failing user goes.
  function failClosed(pathname: string, attempted: string | undefined, err: unknown): NavigationDecision {
    logger.error('[route-guard] could not evaluate route; denying access', pathname, err);
    let rule: RouteRule | null = null;
    try {
      rule = findMatchingRule(pathname, config?.rules ?? []);
    } catch {
      rule = null;
    }
    const restricted = !!(rule?.featureFlag || (rule as { billing?: string } | null)?.billing === 'hard');
    let isPublic = false;
    try {
      isPublic = guard.isPublicRoute(pathname);
    } catch {
      isPublic = false;
    }
    if (isPublic && !restricted) return { type: 'allow' };

    let authenticated = false;
    try {
      authenticated = getBridgeAuth().isAuthenticated();
    } catch {
      authenticated = false;
    }
    if (authenticated) {
      const to = rule?.redirectTo ?? '/';
      if (to !== pathname) return { type: 'redirect', to };
    }
    return loginDecision(pathname, attempted);
  }

  return {
    ...guard,
    async checkRouteRestrictions(pathname: string): Promise<string | null> {
      const deadline = Date.now() + AUTHORIZATION_CHANGE_WAIT_MS;
      await flagsReady;
      return (await checkRestrictionsFresh(pathname, deadline))?.to ?? null;
    },
    // TBP-756 — auth-core 0.8 added this beside checkRouteRestrictions; the
    // spread above would hand out the raw one, which neither waits for the
    // flags nor for a pending token refresh, and trusts a verdict that was in
    // flight across a cache invalidation (TBP-654). Same protection here.
    async checkRouteRestriction(pathname: string): Promise<RouteRestriction | null> {
      const deadline = Date.now() + AUTHORIZATION_CHANGE_WAIT_MS;
      await flagsReady;
      return checkRestrictionsFresh(pathname, deadline);
    },
    async getNavigationDecision(pathname: string, attempted?: string): Promise<NavigationDecision> {
      // TBP-654 — one bound for the whole decision, however many reads it takes.
      const deadline = Date.now() + AUTHORIZATION_CHANGE_WAIT_MS;
      try {
        // A refresh that fails can sign the session out, so let it land before
        // the signed-in check too. Nothing pending (always the case for a
        // signed-out visitor) → no wait at all.
        await settleAuthorizationChange(deadline);
        if (guard.shouldRedirectToLogin(pathname)) {
          // TBP-629 — this branch short-circuits before flagsReady on purpose
          // (an unauthenticated visitor needs no flag evaluation), which is
          // exactly why `attempted` has to be threaded through here too.
          return loginDecision(pathname, attempted);
        }
        await flagsReady;
        const restriction = await checkRestrictionsFresh(pathname, deadline);
        if (restriction) {
          // TBP-756 — reason / flag / feature ride along, so the app can offer
          // an upgrade for `reason: 'plan'`; otherwise the same redirect as before.
          return { type: 'redirect', ...restriction };
        }
        return { type: 'allow' };
      } catch (err) {
        return failClosed(pathname, attempted, err);
      }
    },
  };
}

// Same matching semantics as auth-core's route guard: a RegExp is tested as-is,
// a string is an exact match unless it contains `*` wildcards. First match wins.
function toRegExp(pattern: string | RegExp): RegExp {
  if (pattern instanceof RegExp) return pattern;
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (!pattern.includes('*')) return new RegExp(`^${escaped}$`);
  return new RegExp(`^${escaped.replace(/\\\*/g, '.*')}$`);
}

function findMatchingRule(pathname: string, rules: RouteRule[]): RouteRule | null {
  for (const rule of rules) {
    if (toRegExp(rule.match).test(pathname)) return rule;
  }
  return null;
}
