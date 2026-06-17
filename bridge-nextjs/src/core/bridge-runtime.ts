/**
 * Bridge core runtime — the realtime + reactive-identity wiring that every
 * Bridge capability (auth, flags, billing, …) rides on top of.
 *
 * Ported from bridge-svelte's `core/bridge-runtime.ts`. Reactive primitives are
 * translated per §5.1 (svelte `tokenStore` subscription → Zustand
 * `useBridgeStore` subscription); the realtime client, per-channel auth scoping,
 * session.snapshot fanout, and billing-family event dispatch are framework-
 * agnostic and behave identically.
 *
 * What this module does on `startBridgeRuntime()`:
 *
 *   1. Constructs a single `RealtimeClient` using `appId` + `apiBaseUrl` read
 *      from BridgeAuth's API context (the auth config is the single source of
 *      truth — no separate API base URL config for flags).
 *   2. Wires `setOnOpen` / `setOnClose` to mirror connection state into the
 *      reactive `realtimeStatus` store.
 *   3. Wires `setOnSnapshot` to call `applySessionSnapshot(...)` (drives every
 *      `bridge.*` reactive slice) and dispatch the snapshot through `bridgeEvents`.
 *   4. Wires `setOnUserState` so a server-side claims-change signal forces a
 *      `refreshTokens()` on BridgeAuth — the fresh JWT then flows back through
 *      the token-store subscription below.
 *   5. Subscribes to the Zustand token slice for realtime channel scoping
 *      (setAppId/setWorkspaceId/setUserId) and reauthorize on token refresh.
 *   6. Best-effort: attaches the billing stores to this realtime client and
 *      registers billing-family event handlers so `subscription.*` / `payment.*`
 *      / `dunning.*` / `quota.updated` / `entitlements.changed` flow into
 *      `bridgeEvents._dispatch()`. Guarded — absence of the billing bridge does
 *      not break the core runtime.
 *
 * `startBridgeRuntime()` is idempotent — repeated calls return the existing
 * instance. Call `stopBridgeRuntime()` (e.g. on provider unmount) to flush the
 * realtime client and unsubscribe from the token store.
 */
import {
  RealtimeClient,
  type RealtimeClientConfig,
  type SessionSnapshotMessage,
  type UserStateMessage,
  useBridge as useBillingBridge,
} from '@nebulr-group/bridge-auth-core';

import { getBridgeAuth, useBridgeStore } from './bridge-instance';
import { applySessionSnapshot } from './snapshot-stores';
import { bridgeEvents } from './events';
import { _setRealtimeStatus } from './realtime-status';
import { logger } from '../shared/logger';

const DEFAULT_API_BASE_URL = 'https://api.thebridge.dev';

let _realtime: RealtimeClient | undefined;
let _unsubscribeAuth: (() => void) | undefined;
let _currentAuthToken: string | undefined;

const _onOpenSubs = new Set<() => void>();
const _onCloseSubs = new Set<() => void>();
const _onSnapshotSubs = new Set<(msg: SessionSnapshotMessage) => void>();
const _onUserStateSubs = new Set<(event: { reason: string }) => void>();

/**
 * Advanced runtime overrides. Product consumers never pass these; tests and
 * the demo workspace use them to override the realtime transport.
 */
export interface StartBridgeRuntimeOptions {
  /** Pass-through realtime overrides. `apiBaseUrl`, `apiKey`, `appId`, and
   *  `getAuthToken` are owned by the runtime and ignored here. */
  realtime?: Partial<Omit<RealtimeClientConfig, 'apiBaseUrl' | 'apiKey' | 'appId' | 'getAuthToken'>>;
}

function resolveApiContext(): { apiBaseUrl: string; appId: string | undefined } {
  try {
    const ctx = getBridgeAuth().getApiContext();
    return { apiBaseUrl: ctx.apiBaseUrl ?? DEFAULT_API_BASE_URL, appId: ctx.appId };
  } catch {
    // BridgeAuth not constructed yet — fall through to defaults.
    return { apiBaseUrl: DEFAULT_API_BASE_URL, appId: undefined };
  }
}

/**
 * Start the Bridge runtime. Idempotent — repeated calls are a no-op. Reads
 * `appId` + `apiBaseUrl` from BridgeAuth's API context. Must be called AFTER
 * `initBridge({...})` — typically from `<BridgeProvider>`.
 */
export function startBridgeRuntime(options: StartBridgeRuntimeOptions = {}): void {
  if (_realtime) return;
  if (typeof window === 'undefined') return; // browser-only runtime

  const { apiBaseUrl, appId } = resolveApiContext();

  _realtime = new RealtimeClient({
    ...(options.realtime ?? {}),
    apiBaseUrl,
    apiKey: appId ?? '',
    appId,
    getAuthToken: () => _currentAuthToken,
  });

  let _connectedOnce = false;
  // Set just before _realtime.reauthorize() so the resulting reconnect's
  // setOnOpen knows the token is already fresh and skips its proactive refresh.
  let _reauthInFlight = false;
  _realtime.setOnOpen(() => {
    _setRealtimeStatus('open');
    // On reconnect (not initial connect), proactively refresh tokens to sync
    // any tokenVersion bump missed while the WS was down.
    //
    // EXCEPT when this reconnect was caused by our OWN reauthorize() below (a
    // token-only refresh): the token is already current, and refreshing again
    // would mint a new JWT → tokenStore change → reauthorize() → reconnect →
    // setOnOpen → refresh → … an unbounded loop hammering /auth/token (~32/sec,
    // jamming the page's main thread). Only genuine external reconnects
    // (network blips, server restarts) should trigger the catch-up refresh.
    const causedByReauthorize = _reauthInFlight;
    _reauthInFlight = false;
    if (_connectedOnce && !causedByReauthorize) {
      getBridgeAuth().refreshTokens().catch(() => { /* best-effort */ });
    }
    _connectedOnce = true;
    for (const fn of _onOpenSubs) {
      try { fn(); } catch { /* subscriber errors swallowed */ }
    }
  });

  _realtime.setOnClose(() => {
    _setRealtimeStatus('closed');
    for (const fn of _onCloseSubs) {
      try { fn(); } catch { /* subscriber errors swallowed */ }
    }
  });

  _realtime.setOnSnapshot((msg) => {
    try { applySessionSnapshot(msg.data); } catch { /* store updates shouldn't throw, defensive */ }
    bridgeEvents._dispatch(msg);
    for (const fn of _onSnapshotSubs) {
      try { fn(msg); } catch { /* subscriber errors swallowed */ }
    }
  });

  // user.state_changed → JWT refresh. Fresh tokens flow back through the token
  // subscription below and re-bind channel scopes.
  _realtime.setOnUserState(async (msg: UserStateMessage) => {
    for (const fn of _onUserStateSubs) {
      try { fn({ reason: msg.reason }); } catch { /* subscriber errors swallowed */ }
    }
    try { await getBridgeAuth().refreshTokens(); } catch { /* next scheduled refresh picks it up */ }
  });

  // Best-effort: bind the billing stores + billing-family events to this
  // realtime client so subscription / quotas / entitlements react to live
  // pushes and flow into the unified bridge events surface. Guarded — the
  // billing bridge is optional for the minimal core slice.
  try {
    const billing = useBillingBridge();
    billing.attachToRealtimeClient(_realtime);
    billing.handle({
      'subscription.plan_changed': (m) => bridgeEvents._dispatch(m),
      'payment.failed': (m) => bridgeEvents._dispatch(m),
      'payment.succeeded': (m) => bridgeEvents._dispatch(m),
      'subscription.created': (m) => bridgeEvents._dispatch(m),
      'subscription.updated': (m) => bridgeEvents._dispatch(m),
      'subscription.canceled': (m) => bridgeEvents._dispatch(m),
      'subscription.reactivated': (m) => bridgeEvents._dispatch(m),
      'subscription.trial_started': (m) => bridgeEvents._dispatch(m),
      'subscription.trial_ending_soon': (m) => bridgeEvents._dispatch(m),
      'subscription.trial_converted': (m) => bridgeEvents._dispatch(m),
      'subscription.trial_expired': (m) => bridgeEvents._dispatch(m),
      'dunning.entered': (m) => bridgeEvents._dispatch(m),
      'dunning.retry_scheduled': (m) => bridgeEvents._dispatch(m),
      'dunning.recovered': (m) => bridgeEvents._dispatch(m),
      'dunning.exhausted': (m) => bridgeEvents._dispatch(m),
      'quota.updated': (m) => bridgeEvents._dispatch(m),
      'entitlements.changed': (m) => bridgeEvents._dispatch(m),
    });
  } catch (err) {
    logger.debug('[bridge-runtime] billing bridge attach skipped:', err);
  }

  // Token subscription — owns realtime channel scoping + reauthorize on
  // token-only refresh. Capability-specific subs are layered on top by their
  // own bootstrappers.
  const applyTokens = (accessToken: string | null | undefined): void => {
    const prevAuthToken = _currentAuthToken;
    _currentAuthToken = accessToken ?? undefined;

    if (!accessToken) {
      // Logout — drop user + workspace channel scopes. The app channel keeps
      // its anonymous app-id auth.
      _realtime!.setUserId(undefined);
      _realtime!.setWorkspaceId(undefined);
      return;
    }

    const claims = decodeJwtPayload(accessToken);
    if (!claims) return;

    _realtime!.setAppId(typeof claims.aid === 'string' ? claims.aid : undefined);
    _realtime!.setWorkspaceId(typeof claims.tid === 'string' ? claims.tid : undefined);
    _realtime!.setUserId(typeof claims.sub === 'string' ? claims.sub : undefined);

    // Token-only refresh (same user, new JWT): force a reauthorize so the
    // server re-validates against the new token immediately.
    if (prevAuthToken && _currentAuthToken && prevAuthToken !== _currentAuthToken) {
      // Mark this as a self-induced reconnect so setOnOpen skips its proactive
      // refresh (which would mint a new token → land back here → loop forever).
      _reauthInFlight = true;
      void _realtime!.reauthorize();
    }
  };

  // Seed from current token state, then subscribe for changes.
  applyTokens(useBridgeStore.getState().tokens?.accessToken ?? null);
  let _prevToken = useBridgeStore.getState().tokens?.accessToken ?? null;
  _unsubscribeAuth = useBridgeStore.subscribe((state) => {
    const next = state.tokens?.accessToken ?? null;
    if (next !== _prevToken) {
      _prevToken = next;
      applyTokens(next);
    }
  });

  // Best-effort start. RealtimeClient gracefully no-ops if the workspace's
  // `/realtime/config` returns `kind: 'noop'`.
  void _realtime.start();
}

/**
 * Stop the runtime. Idempotent — safe to call without a prior start. Flushes the
 * realtime client and unsubscribes from the token store. Subscriber sets are NOT
 * cleared so re-start picks up existing capability extensions.
 */
export async function stopBridgeRuntime(): Promise<void> {
  if (_unsubscribeAuth) {
    _unsubscribeAuth();
    _unsubscribeAuth = undefined;
  }
  if (_realtime) {
    try { await _realtime.stop(); } catch { /* already stopped, ignore */ }
    _realtime = undefined;
  }
  _currentAuthToken = undefined;
}

/**
 * Get the shared RealtimeClient. Returns `undefined` if `startBridgeRuntime()`
 * hasn't run yet. Used by capability bootstrappers (e.g. flag attach) to register
 * their own bridge/cache against the same channel.
 */
export function getBridgeRealtime(): RealtimeClient | undefined {
  return _realtime;
}

/** Get the current access token cached for the realtime client's getAuthToken. */
export function getCurrentAuthToken(): string | undefined {
  return _currentAuthToken;
}

/** Subscribe to realtime `open` events. Returns an unsubscribe fn. */
export function onBridgeRealtimeOpen(handler: () => void): () => void {
  _onOpenSubs.add(handler);
  return () => _onOpenSubs.delete(handler);
}

/** Subscribe to realtime `close` events. Returns an unsubscribe fn. */
export function onBridgeRealtimeClose(handler: () => void): () => void {
  _onCloseSubs.add(handler);
  return () => _onCloseSubs.delete(handler);
}

/** Subscribe to `session.snapshot` messages. Returns an unsubscribe fn. */
export function onBridgeRealtimeSnapshot(
  handler: (msg: SessionSnapshotMessage) => void,
): () => void {
  _onSnapshotSubs.add(handler);
  return () => _onSnapshotSubs.delete(handler);
}

/** Subscribe to server-side `user.state_changed` signals. */
export function onBridgeRealtimeUserState(
  handler: (event: { reason: string }) => void,
): () => void {
  _onUserStateSubs.add(handler);
  return () => _onUserStateSubs.delete(handler);
}

/** Test-only — reset module-level state between unit tests. */
export function __resetBridgeRuntime(): void {
  _onOpenSubs.clear();
  _onCloseSubs.clear();
  _onSnapshotSubs.clear();
  _onUserStateSubs.clear();
  _currentAuthToken = undefined;
  if (_unsubscribeAuth) {
    _unsubscribeAuth();
    _unsubscribeAuth = undefined;
  }
  _realtime = undefined;
}

// ── helpers ─────────────────────────────────────────────────────────────────

/** Decode a JWT payload without signature verification (client context only). */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}
