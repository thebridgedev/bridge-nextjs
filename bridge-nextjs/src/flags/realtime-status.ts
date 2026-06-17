/**
 * Minimal flags-layer re-export of the realtime connection status.
 *
 * Mirrors bridge-svelte's `flags/realtime-status.ts`, which re-exports the core
 * realtime status store from the flags barrel so consumers can read connection
 * state without importing the whole core graph. The actual store lives in
 * `core/realtime-status.ts`; this is a thin pass-through kept here for parity
 * with svelte's module layout (the full Feature Flags surface lands in a
 * follow-up feature).
 */
export { realtimeStatus, useRealtimeStatus } from '../core/realtime-status';
export type { ConnectionState } from '@nebulr-group/bridge-auth-core';
