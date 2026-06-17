'use client';

/**
 * Billing 2.0 port (TBP-248/263) — generic `BridgeReadable` → React adapter.
 *
 * The Billing 2.0 drop-in components read from auth-core's billing surface
 * (`useBridge().subscription` / `.quotas`), which exposes the Svelte-store
 * contract: `subscribe(listener) => unsubscribe`, listener invoked immediately
 * with the current value and again on every change. svelte components consume
 * that contract via `$state` + `onMount(() => store.subscribe(...))`.
 *
 * React's idiomatic equivalent is `useSyncExternalStore`. F1 shipped a
 * `useSyncExternalStore` adapter only for the FF 2.0 flag registry
 * (`flags/use-flag.ts`) — that one is bound to the flag version bus, not to the
 * generic `subscribe/snapshot` shape these billing stores use. So this is the
 * generic adapter the §6.2 plan called for (locked decision #2: create only
 * because F1 shipped no equivalent).
 *
 * Two shapes are supported:
 *   - `useBridgeReadable(store)` — a Svelte-store-compatible readable (the
 *     `bridge.tenant.*` `BridgeReadable<T>` from `core/bridge.ts`, or any
 *     `{ subscribe }`). The current value is captured from the immediate
 *     listener call, so no separate `snapshot()` is needed.
 *   - `useBridgeSnapshot(subscribe, getSnapshot)` — the lower-level form for
 *     auth-core stores that split subscription (`store.subscribe(fn)`) from the
 *     current-value read (`store.snapshot()` / `store.quota(metric)`). This is
 *     what `BridgeSubscriptionStatus`, `BridgeBillingNotice`, and
 *     `BridgeQuotaBanner` use.
 */
import { useCallback, useRef, useSyncExternalStore } from 'react';

/** Minimal Svelte-store-compatible readable. */
export interface ReadableLike<T> {
  subscribe(run: (value: T) => void): () => void;
}

/**
 * Subscribe to a Svelte-store-compatible readable and re-render on change.
 *
 * The readable's contract guarantees the listener is called synchronously with
 * the current value on subscribe, so we cache that value and surface it as the
 * snapshot. SSR falls back to the same cached value (initially `undefined`
 * until first client subscribe); callers that need an SSR-safe default should
 * gate on the value being present, exactly like the svelte components do.
 */
export function useBridgeReadable<T>(readable: ReadableLike<T>): T | undefined {
  const valueRef = useRef<T | undefined>(undefined);

  const subscribe = useCallback(
    (onStoreChange: () => void): (() => void) => {
      return readable.subscribe((value) => {
        valueRef.current = value;
        onStoreChange();
      });
    },
    [readable],
  );

  const getSnapshot = useCallback((): T | undefined => valueRef.current, []);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * Lower-level adapter for stores that separate `subscribe(fn)` from the
 * current-value read. `subscribe` registers a change listener (its argument is
 * ignored — we re-read via `getSnapshot` on every notification); `getSnapshot`
 * returns the current value.
 *
 * A reference cache prevents `useSyncExternalStore` tearing: when the store
 * notifies but `getSnapshot` returns a value structurally equal to the last
 * one, the cached reference is returned so React skips the re-render. Equality
 * is reference-first, then a shallow JSON compare for the small plain-object
 * snapshots these billing stores emit.
 */
export function useBridgeSnapshot<T>(
  subscribe: (onChange: () => void) => () => void,
  getSnapshot: () => T,
): T {
  const lastRef = useRef<{ value: T } | null>(null);

  const cachedSnapshot = useCallback((): T => {
    const next = getSnapshot();
    const prev = lastRef.current;
    if (prev && sameValue(prev.value, next)) {
      return prev.value;
    }
    lastRef.current = { value: next };
    return next;
    // getSnapshot is provided by the caller; treated as stable per call site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stableSubscribe = useCallback(
    (onStoreChange: () => void): (() => void) => subscribe(onStoreChange),
    // subscribe is provided by the caller; treated as stable per call site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return useSyncExternalStore(stableSubscribe, cachedSnapshot, cachedSnapshot);
}

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a && b && typeof a === 'object') {
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch {
      return false;
    }
  }
  return false;
}
