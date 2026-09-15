/**
 * Live Channel Unification — reactive store for the realtime connection state.
 *
 * Ported from bridge-svelte's `core/realtime-status.ts`. The Bridge realtime
 * channel is a fundamental construct shared by flags AND billing (and any future
 * capability that needs live updates). The bridge runtime mounts the connection;
 * this store reflects its current state. Consumers subscribe to surface offline
 * indicators, retry banners, etc.
 *
 * Reactive primitive translated per §5.1: Svelte `writable` → Zustand store.
 * A React hook (`useRealtimeStatus`) and a Svelte-store-compatible `subscribe`
 * are both exposed so the value reads cleanly from components and from plain TS.
 *
 * TBP-644 — the full `RealtimeStatus` (reason, whose side, retrying, docs link,
 * ref) is exposed as SIBLINGS (`useRealtimeStatusDetail` / `realtimeStatusDetail`)
 * rather than by changing `useRealtimeStatus` / `realtimeStatus`: those return a
 * plain `ConnectionState` string that apps compare and render directly, so
 * widening their type would break them. The state always agrees across both.
 */
import { create } from 'zustand';
import type { ConnectionState, RealtimeStatus } from '@nebulr-group/bridge-auth-core';

interface RealtimeStatusState {
  status: ConnectionState;
  detail: RealtimeStatus;
}

const useStore = create<RealtimeStatusState>(() => ({
  status: 'idle',
  detail: { state: 'idle', retrying: false, since: Date.now() },
}));

/** React hook — reactive realtime connection state. */
export function useRealtimeStatus(): ConnectionState {
  return useStore((s) => s.status);
}

/**
 * React hook — the full realtime status (TBP-644): `state`, and when live
 * updates are not working, the `reason`, whose `side` the fault is on
 * (`app` / `config` / `bridge` / `network`), whether it is still `retrying`,
 * a `docsUrl` and a support `ref`.
 */
export function useRealtimeStatusDetail(): RealtimeStatus {
  return useStore((s) => s.detail);
}

/**
 * Svelte-store-compatible readable of the current realtime connection state.
 * `subscribe(fn)` calls `fn` immediately and on every change; returns an
 * unsubscribe function.
 */
export const realtimeStatus = {
  subscribe(run: (value: ConnectionState) => void): () => void {
    run(useStore.getState().status);
    return useStore.subscribe((s, prev) => {
      if (s.status !== prev.status) run(s.status);
    });
  },
};

/** Svelte-store-compatible readable of the full realtime status (TBP-644). */
export const realtimeStatusDetail = {
  subscribe(run: (value: RealtimeStatus) => void): () => void {
    run(useStore.getState().detail);
    return useStore.subscribe((s, prev) => {
      if (s.detail !== prev.detail) run(s.detail);
    });
  },
};

/** Internal — set the current state. Only called by `startBridgeRuntime`. */
export function _setRealtimeStatus(state: ConnectionState): void {
  useStore.setState((s) => ({
    status: state,
    // Keep the detail in step on an auth-core without the status hook; with
    // the hook, the detail for this state has already landed — leave it.
    detail: s.detail.state === state ? s.detail : { state, retrying: false, since: Date.now() },
  }));
}

/** Internal — set the full status. Only called by `startBridgeRuntime`. */
export function _setRealtimeStatusDetail(status: RealtimeStatus): void {
  useStore.setState({ status: status.state, detail: status });
}
