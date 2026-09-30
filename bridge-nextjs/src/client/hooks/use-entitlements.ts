'use client';

/**
 * TBP-742 (port of bridge-svelte TBP-697) — `useEntitlements()`: the
 * workspace's plan entitlements, for the rare page that checks the plan
 * directly instead of through a flag.
 *
 *   const entitlements = useEntitlements();
 *   if (!entitlements.ready) return <Spinner />;
 *   return entitlements.can('ai_completions') ? <AiPanel /> : <UpgradeLink />;
 *
 * The standard gate is a flag ruled `bridge:billing.entitlement.<key> eq true`
 * (`<FeatureFlag flagKey>`); in development the first `can()` logs a one-time
 * note saying so.
 *
 * `can(key)` is fail-closed: `false` until Bridge has answered, and `false` for
 * a key the plan does not grant. `ready` tells those two apart — check it before
 * treating a `false` as "this plan cannot", so a cold start shows a spinner
 * instead of a paywall. Signing out empties it.
 */
import { useMemo, useSyncExternalStore } from 'react';
import { useBridge as useBillingBridge } from '@nebulr-group/bridge-auth-core';
import { useBridgeStore } from '../../core/bridge-instance';
import { useSnapshotStore } from '../../core/snapshot-stores';
import { noteDirectPlanCheck } from '../../core/direct-plan-check-note';

export interface EntitlementsState {
  /** True once Bridge has answered for this session. Before that, every `can()` is `false`. */
  readonly ready: boolean;
  /** Fail-closed: `true` only when the plan grants `key`. */
  can(key: string): boolean;
  /** Every entitlement Bridge sent, as `{ key: boolean }`. Empty until `ready`. */
  readonly all: Readonly<Record<string, boolean>>;
}

type CoreStore = ReturnType<typeof useBillingBridge>['entitlementsStore'];

function coreStore(): CoreStore | null {
  try {
    return useBillingBridge().entitlementsStore;
  } catch {
    return null;
  }
}

let _coreCache: { map: Record<string, boolean> | null; key: string } = { map: null, key: 'null' };
function readCore(): Record<string, boolean> | null {
  const store = coreStore();
  if (!store) return null;
  const hydrated = typeof store.isHydrated === 'function' ? store.isHydrated() : false;
  const map = hydrated ? (store.all() as Record<string, boolean>) : null;
  const key = map === null ? 'null' : JSON.stringify(map);
  if (key !== _coreCache.key) _coreCache = { map, key };
  return _coreCache.map;
}

/** The entitlements state for a map, or not-ready for `null`. */
export function entitlementsStateOf(map: Record<string, boolean> | null): EntitlementsState {
  const all = Object.freeze({ ...(map ?? {}) });
  return Object.freeze({
    ready: map !== null,
    all,
    can: (key: string) => {
      noteDirectPlanCheck('can', key);
      return all[key] === true;
    },
  });
}

export function useEntitlements(): EntitlementsState {
  const signedIn = useBridgeStore((s) => !!s.tokens?.accessToken);
  const snapshot = useSnapshotStore((s) => s.tenantEntitlements);
  const core = useSyncExternalStore(
    (onChange) => coreStore()?.subscribe(onChange) ?? (() => {}),
    readCore,
    () => null,
  );
  return useMemo(
    () => entitlementsStateOf(signedIn ? (snapshot ?? core) : null),
    [signedIn, snapshot, core],
  );
}
