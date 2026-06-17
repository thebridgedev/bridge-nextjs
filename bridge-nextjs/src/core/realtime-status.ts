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
 */
import { create } from 'zustand';
import type { ConnectionState } from '@nebulr-group/bridge-auth-core';

interface RealtimeStatusState {
  status: ConnectionState;
}

const useStore = create<RealtimeStatusState>(() => ({ status: 'idle' }));

/** React hook — reactive realtime connection state. */
export function useRealtimeStatus(): ConnectionState {
  return useStore((s) => s.status);
}

/**
 * Svelte-store-compatible readable of the current realtime connection state.
 * `subscribe(fn)` calls `fn` immediately and on every change; returns an
 * unsubscribe function.
 */
export const realtimeStatus = {
  subscribe(run: (value: ConnectionState) => void): () => void {
    run(useStore.getState().status);
    return useStore.subscribe((s) => run(s.status));
  },
};

/** Internal — set the current status. Only called by `startBridgeRuntime`. */
export function _setRealtimeStatus(state: ConnectionState): void {
  useStore.setState({ status: state });
}
