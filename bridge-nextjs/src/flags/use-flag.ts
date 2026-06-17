'use client';

// bridge-nextjs/flags — React reactive flag access (FF 2.0).
//
// React translation of bridge-svelte's runes-based `flag.svelte.ts` (§5.1):
//   - svelte `$state.raw<Map>` version counter + `subscribeToFlagChanges`
//     → `useSyncExternalStore` subscribing to the same registry change-bus.
//   - svelte `$derived.by(() => evaluateFlag(...))` → the `getSnapshot`
//     closure passed to `useSyncExternalStore`, recomputed on every store bump.
//
// The reactive store layer here is module-level (one per app, like svelte's
// single runtime) — a monotonically increasing version counter that bumps on
// every registry notification. React subscribers re-run their snapshot on each
// bump and re-render only when the resolved value actually changes.

import { useCallback, useRef, useSyncExternalStore } from 'react';
import type { EvalContext, FlagEvalResult } from '@nebulr-group/bridge-auth-core';
import { evaluateFlag, subscribeToFlagChanges } from './registry';

// ── Module-level reactive version bus ─────────────────────────────────────────
//
// One global counter, bumped on every registry change-notification. React's
// `useSyncExternalStore` subscribes to it; the snapshot closure re-reads the
// flag whenever the counter changes. This mirrors svelte's per-key version map,
// collapsed to a single counter (React re-renders are cheap and the value-diff
// guard below prevents redundant renders).

let _version = 0;
const _versionListeners = new Set<() => void>();

// Wire the registry's change-bus to the version counter once, for the lifetime
// of the module. Any registry notification (single key or '*') bumps the
// counter and notifies React subscribers.
subscribeToFlagChanges(() => {
  _version += 1;
  for (const l of Array.from(_versionListeners)) {
    try {
      l();
    } catch {
      // subscriber errors must not break notify
    }
  }
});

function subscribeVersion(onStoreChange: () => void): () => void {
  _versionListeners.add(onStoreChange);
  return () => {
    _versionListeners.delete(onStoreChange);
  };
}

function getVersion(): number {
  return _version;
}

/** Read the current reactive version — exported for the `<FeatureFlag>` component. */
export function _flagVersion(): number {
  return _version;
}

/** Subscribe to flag-version bumps (used by `<FeatureFlag>`). Returns unsubscribe. */
export function _subscribeFlagVersion(onChange: () => void): () => void {
  return subscribeVersion(onChange);
}

/** Get a cached `useSyncExternalStore` version snapshot (used by `<FeatureFlag>`). */
export function _getFlagVersionSnapshot(): number {
  return getVersion();
}

// ── useFlag ───────────────────────────────────────────────────────────────────

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

/**
 * Reactive flag accessor. Returns the Bridge-decided `{ value, passed }` and
 * re-renders whenever the flag changes in the cache (live update, hydrate,
 * token change).
 *
 *   const { value, passed } = useFlag('show_banner', false);
 *   if (value) return <Banner />;
 *
 * Pass `context` to drive rule eval with dev-supplied attributes — e.g.
 * `useFlag('enterprise-feature', false, { attributes: { plan } })`. Per-call
 * attributes win on key collision over Bridge-managed providers.
 */
export function useFlag<T>(
  key: string,
  defaultValue: T,
  context?: Partial<EvalContext>,
): { readonly value: T; readonly passed: boolean } {
  // Cache the last resolved result so `getSnapshot` returns a stable reference
  // when the underlying value hasn't changed — required by useSyncExternalStore
  // to avoid an infinite render loop.
  const lastRef = useRef<FlagEvalResult<T> | null>(null);
  const contextKey = context ? safeStringify(context) : '';

  const getSnapshot = useCallback((): FlagEvalResult<T> => {
    const next = evaluateFlag<T>(key, defaultValue, context);
    const prev = lastRef.current;
    if (prev && prev.passed === next.passed && sameValue(prev.value, next.value)) {
      return prev;
    }
    lastRef.current = next;
    return next;
    // `_version` is read via getVersion() inside useSyncExternalStore's
    // subscribe loop; contextKey/key/defaultValue are the eval inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, defaultValue, contextKey]);

  const result = useSyncExternalStore(subscribeVersion, getSnapshot, getSnapshot);
  return { value: result.value, passed: result.passed };
}

function safeStringify(v: unknown): string {
  try {
    return JSON.stringify(v) ?? '';
  } catch {
    return '';
  }
}

/**
 * Imperative subscribe API — for non-component code or tests that want to
 * observe a single flag without React. Returns `{ subscribe }` where
 * `subscribe(run)` calls `run` immediately and on every change, and returns an
 * unsubscribe fn. Mirrors bridge-svelte's `flagStore`.
 */
export interface FlagStore<T> {
  subscribe: (run: (value: FlagEvalResult<T>) => void) => () => void;
}

export function flagStore<T>(
  key: string,
  defaultValue: T,
  context?: Partial<EvalContext>,
): FlagStore<T> {
  return {
    subscribe(run) {
      run(evaluateFlag<T>(key, defaultValue, context));
      return subscribeVersion(() => {
        run(evaluateFlag<T>(key, defaultValue, context));
      });
    },
  };
}
