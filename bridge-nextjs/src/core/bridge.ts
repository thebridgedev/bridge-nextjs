/**
 * Live Channel Unification (TBP-288/319) — unified read surface for bridge-nextjs.
 *
 * Ported from bridge-svelte's `core/bridge.ts`. Single object grouped by scope
 * (`bridge.app` / `bridge.tenant` / `bridge.user`). Each snapshot slice is a
 * Svelte-store-compatible readable populated from `session.snapshot` on channel
 * connect AND on every reconnect; lazy slices (`app.plans`) populate on first
 * `.load()` / `await`.
 *
 * Reactive primitive translation (§5.1): svelte `derived(...)` stores become
 * thin Svelte-store-compatible readables backed by the Zustand snapshot store
 * (`snapshot-stores.ts`). The `.subscribe(fn)` contract is preserved (immediate
 * call + on every change, returns unsubscribe) so the unified-surface Playwright
 * spec ports verbatim. React consumers read the same state via `useBridge()` and
 * the underlying Zustand hooks.
 *
 * The singleton `bridge` is available immediately on import — every slice is
 * `null` until the realtime client receives a `session.snapshot`, at which point
 * each slice updates atomically. Identity is stable: the object reference never
 * changes, so consumers can destructure or store sub-references freely.
 */
import {
  useSnapshotStore,
  type BrandingSnapshot,
  type SubscriptionSnapshot,
  type UserSnapshot,
} from './snapshot-stores';
import { LazySlice } from './lazy-slice';
import type { Plan } from '@nebulr-group/bridge-auth-core';
import { DevAttributeProvider } from '@nebulr-group/bridge-auth-core';
import { getBridgeAuth } from './bridge-instance';
import { bridgeEvents, type BridgeEventsDispatcher } from './events';

/** Svelte-store-compatible readable derived from a Zustand selector. */
export interface BridgeReadable<T> {
  subscribe(run: (value: T) => void): () => void;
}

function makeReadable<T>(select: (s: ReturnType<typeof useSnapshotStore.getState>) => T): BridgeReadable<T> {
  return {
    subscribe(run: (value: T) => void): () => void {
      run(select(useSnapshotStore.getState()));
      let prev = select(useSnapshotStore.getState());
      return useSnapshotStore.subscribe((s) => {
        const next = select(s);
        if (next !== prev) {
          prev = next;
          run(next);
        }
      });
    },
  };
}

export interface BridgeAppSurface {
  /** Whitelabel branding (logo, colors, name). Populated by session.snapshot. */
  branding: BridgeReadable<BrandingSnapshot | null>;
  /**
   * Full plan catalog. Lazy — `await bridge.app.plans` or `bridge.app.plans.load()`
   * triggers the fetch on first access. Returns `null` until loaded.
   */
  plans: LazySlice<Plan[]>;
}

export interface BridgeTenantSurface {
  /** Workspace identifier. Populated by session.snapshot. */
  id: BridgeReadable<string | null>;
  /** Workspace display name. Populated by session.snapshot. */
  name: BridgeReadable<string | null>;
  /** Canonical subscription (plan + status + endsAt). Populated by session.snapshot. */
  subscription: BridgeReadable<SubscriptionSnapshot | null>;
  /**
   * Entitlements scope. `snapshot` is the full `{ key: boolean }` map; `can(key)`
   * is the imperative read for ergonomic checks. The map is populated by
   * `session.snapshot` and replaced wholesale on every `entitlements.changed`
   * push.
   */
  entitlements: {
    snapshot: BridgeReadable<Record<string, boolean> | null>;
    can(key: string): boolean;
  };
}

export interface BridgeSurface {
  app: BridgeAppSurface;
  tenant: BridgeTenantSurface;
  /** Authenticated user (id/email/role/tenantId). Populated by session.snapshot. */
  user: BridgeReadable<UserSnapshot | null>;
  /**
   * Single attribute write surface. `set/bind/bindMany` publish dev-supplied
   * attributes into the flag eval context. `get()` returns the current merged
   * map.
   */
  attributes: DevAttributeProvider;
  /**
   * Single events dispatcher. `bridge.events.handle({...})` is the canonical way
   * to subscribe to channel events.
   */
  events: BridgeEventsDispatcher;
}

function entitlementsCan(key: string): boolean {
  return !!useSnapshotStore.getState().tenantEntitlements?.[key];
}

// Lazy slice loaders — deferred to first .load() / await. Wrapped in arrow
// functions so getBridgeAuth() resolution happens at load time, not at module
// import (otherwise SSR import of the bridge surface throws because initBridge()
// hasn't been called yet).
const _plansSlice = new LazySlice<Plan[]>({
  load: async () => getBridgeAuth().getPlans(),
});

// Singleton dev-attribute provider. The flags wiring registers this instance
// with the flag eval registry at bootstrap (LAST in registration order so dev
// keys win on collision).
const _devAttributes = new DevAttributeProvider();

export const bridge: BridgeSurface = {
  app: {
    branding: makeReadable((s) => s.appBranding),
    plans: _plansSlice,
  },
  tenant: {
    id: makeReadable((s) => s.tenantId),
    name: makeReadable((s) => s.tenantName),
    subscription: makeReadable((s) => s.tenantSubscription),
    entitlements: {
      snapshot: makeReadable((s) => s.tenantEntitlements),
      can: entitlementsCan,
    },
  },
  user: makeReadable((s) => s.user),
  attributes: _devAttributes,
  events: bridgeEvents,
};

/** Internal: the flags wiring imports this to register the dev provider. */
export function _getDevAttributeProvider(): DevAttributeProvider {
  return _devAttributes;
}

/**
 * Test-only: reset every lazy slice on the bridge to its unloaded state.
 * @internal
 */
export function __resetBridgeLazySlices(): void {
  _plansSlice._resetForTests();
}
