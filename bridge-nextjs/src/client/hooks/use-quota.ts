'use client';

/**
 * TBP-742 (port of bridge-svelte TBP-697) — `useQuota(metric)`: one quota's
 * numbers for your own UI (level 2).
 *
 *   const projects = useQuota('projects');
 *   if (projects.loading) return <Spinner />;
 *   if (projects.unlimited) return <>Unlimited projects</>;
 *   return <>{projects.used} of {projects.limit} projects</>;
 *
 * Reads the same live quota cache `<BridgeQuotaBanner>` does (auth-core's
 * `QuotaStore`: one `GET /usage/quota/:metric` on first read, then every
 * `quota.updated` push), so the numbers move on their own.
 *
 * The one rule it keeps: **no number until there is a real one.** While the
 * first answer is in flight `loading` is true and `used`, `limit` and
 * `remaining` are `null` — never `0`, which would render "0 of 0" or "0 used"
 * on a workspace that is actually at its cap.
 */
import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { useBridge as useBillingBridge, type QuotaSnapshot } from '@nebulr-group/bridge-auth-core';
import { useBridgeStore } from '../../core/bridge-instance';

type QuotaStore = ReturnType<typeof useBillingBridge>['quotas'];

export interface QuotaState {
  /** True until Bridge has answered for this metric. Numbers are `null` meanwhile. */
  readonly loading: boolean;
  /** True once Bridge has answered that the plan puts no quota on this metric. */
  readonly unlimited: boolean;
  /** How much is used (counter: this period; gauge: how many exist). `null` while loading or unlimited. */
  readonly used: number | null;
  /** The plan's cap. `null` while loading or unlimited. */
  readonly limit: number | null;
  /** What is left before the cap. `null` while loading or unlimited. */
  readonly remaining: number | null;
  /** `'approaching'` from 80%, `'critical'` from 95%. `null` below that, while loading, or unlimited. */
  readonly warningLevel: 'approaching' | 'critical' | null;
  /** `'counter'` (resets each period) or `'gauge'` (your app's own count). `null` while loading or unlimited. */
  readonly kind: 'counter' | 'gauge' | null;
  /** The full snapshot (policy, overage fields, …), or `null` while loading or unlimited. */
  readonly snapshot: QuotaSnapshot | null;
}

// The QuotaStore answers "no quota on this plan" by DELETING the metric and
// notifying `undefined`; its `ensureHydrated()` refetches any metric it has no
// snapshot for. A reader that re-read on that notification would loop one GET
// at a time. So "Bridge said unlimited" answers are remembered here, once per
// store, until the workspace changes.
interface Tracking {
  unlimited: Set<string>;
  workspace: string | null | undefined;
}
const _tracking = new WeakMap<QuotaStore, Tracking>();

function tracking(store: QuotaStore): Tracking {
  let t = _tracking.get(store);
  if (!t) {
    t = { unlimited: new Set(), workspace: undefined };
    _tracking.set(store, t);
    const tr = t;
    store.subscribe((metric, snap) => {
      if (snap) tr.unlimited.delete(metric);
      else tr.unlimited.add(metric);
    });
  }
  return t;
}

function workspaceOf(accessToken: string | null | undefined): string | null {
  if (!accessToken) return null;
  try {
    const part = accessToken.split('.')[1];
    if (!part) return null;
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
    const tid = (JSON.parse(json) as { tid?: unknown }).tid;
    return typeof tid === 'string' ? tid : null;
  } catch {
    return null;
  }
}

const LOADING: QuotaState = Object.freeze({
  loading: true,
  unlimited: false,
  used: null,
  limit: null,
  remaining: null,
  warningLevel: null,
  kind: null,
  snapshot: null,
});

const UNLIMITED: QuotaState = Object.freeze({ ...LOADING, loading: false, unlimited: true });

/** The current state of one metric. Point-in-time; `useQuota` is the reactive form. */
export function readQuotaState(metric: string, accessToken?: string | null): QuotaState {
  let store: QuotaStore;
  try {
    store = useBillingBridge().quotas;
  } catch {
    return LOADING;
  }
  const t = tracking(store);
  if (accessToken !== undefined) {
    const ws = workspaceOf(accessToken);
    // A different workspace (or signing in/out) is a different plan.
    if (t.workspace !== undefined && ws !== t.workspace) t.unlimited.clear();
    t.workspace = ws;
  }
  const snap = store.get(metric);
  if (snap) {
    return {
      loading: false,
      unlimited: false,
      used: snap.used,
      limit: snap.limit,
      remaining: snap.remaining,
      warningLevel: snap.warningLevel ?? null,
      // Servers that predate gauges send no kind: those quotas are counters.
      kind: (snap as { kind?: string }).kind === 'gauge' ? 'gauge' : 'counter',
      snapshot: snap,
    };
  }
  if (t.unlimited.has(metric)) return UNLIMITED;
  return LOADING;
}

function same(a: QuotaState, b: QuotaState): boolean {
  return (
    a.loading === b.loading &&
    a.unlimited === b.unlimited &&
    a.used === b.used &&
    a.limit === b.limit &&
    a.remaining === b.remaining &&
    a.warningLevel === b.warningLevel &&
    a.kind === b.kind &&
    a.snapshot === b.snapshot
  );
}

/**
 * Live numbers for one quota metric.
 *
 * @param metric The metric key (`'projects'`, `'ai_completions'`, `'seats'`).
 */
export function useQuota(metric: string): QuotaState {
  const accessToken = useBridgeStore((s) => s.tokens?.accessToken ?? null);
  const last = useRef<QuotaState>(LOADING);

  const subscribe = useCallback(
    (onChange: () => void) => {
      let store: QuotaStore;
      try {
        store = useBillingBridge().quotas;
      } catch {
        return () => {};
      }
      tracking(store);
      return store.subscribe((m) => {
        if (m === metric) onChange();
      });
    },
    [metric],
  );

  const getSnapshot = useCallback((): QuotaState => {
    const next = readQuotaState(metric, accessToken);
    if (same(last.current, next)) return last.current;
    last.current = next;
    return next;
  }, [metric, accessToken]);

  const state = useSyncExternalStore(subscribe, getSnapshot, () => LOADING);

  // First read, a new metric, or a token arriving (what lets a pre-sign-in read
  // finally hydrate): ask. The store dedupes in-flight requests. Never during
  // render — a read there would start a request on every render.
  useEffect(() => {
    let store: QuotaStore;
    try {
      store = useBillingBridge().quotas;
    } catch {
      return;
    }
    const t = tracking(store);
    if (!store.get(metric) && !t.unlimited.has(metric)) store.ensureHydrated(metric);
  }, [metric, accessToken]);

  return state;
}
