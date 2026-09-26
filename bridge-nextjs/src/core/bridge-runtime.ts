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
  fetchBillingState,
  type QuotaSnapshot,
  type RealtimeClientConfig,
  type RealtimeStatus,
  type SessionSnapshotMessage,
  type UserStateMessage,
  useBridge as useBillingBridge,
} from '@nebulr-group/bridge-auth-core';

import { getBridgeAuth, useBridgeStore } from './bridge-instance';
import {
  applyCatchUpSnapshot,
  applyEntitlementsChanged,
  applySessionSnapshot,
  applySubscriptionPlanChanged,
  applySubscriptionState,
  useSnapshotStore,
  type SessionSnapshotData,
} from './snapshot-stores';
import { bridgeEvents } from './events';
import { _setRealtimeStatus, _setRealtimeStatusDetail } from './realtime-status';
import { logger } from '../shared/logger';
import {
  clearPendingAuthorizationChange,
  invalidateRouteGuardCache,
  pendingAuthorizationChange,
  trackAuthorizationChange,
} from '../auth/guard-cache';

/**
 * Why the route-guard cache was invalidated (TBP-654): a plan change, an
 * entitlements change, a server-side user state change, a new access token
 * (sign-in, refresh, sign-out), or a realtime flag change.
 */
export type BridgeAuthorizationChangeReason =
  | 'subscription.plan_changed'
  | 'entitlements.changed'
  | 'user.state_changed'
  | 'token'
  | 'flag'
  | 'reconnect';

const DEFAULT_API_BASE_URL = 'https://api.thebridge.dev';

let _realtime: RealtimeClient | undefined;
let _unsubscribeAuth: (() => void) | undefined;
let _currentAuthToken: string | undefined;

const _onOpenSubs = new Set<() => void>();
const _onCloseSubs = new Set<() => void>();
const _onSnapshotSubs = new Set<(msg: SessionSnapshotMessage) => void>();
const _onUserStateSubs = new Set<(event: { reason: string }) => void>();
// TBP-644 — full realtime status (state + reason + whose side + retrying).
const _onStatusSubs = new Set<(status: RealtimeStatus) => void>();
// TBP-654 — anything that can change a route verdict.
const _onAuthorizationChangeSubs = new Set<(reason: BridgeAuthorizationChangeReason) => void>();

// TBP-654 — route guards (`createRouteGuard`) read auth-core's
// FeatureFlagService (5-min TTL), and a plan-targeted rule's verdict depends on
// the user's plan and token, not on the flag definition. Nothing cleared that
// cache here — not even a realtime flag change (bridge-svelte's TBP-575 wiring
// was never ported) — so an upgraded user stayed locked out of the route they
// had just paid for until the TTL ran out or they reloaded.
//
// Called exactly once per triggering event, and always BEFORE the event is
// dispatched to app handlers, so a handler that navigates is evaluated
// against fresh state. Invalidation is free (no fetch); the refetch happens at
// the next route evaluation.
//
// `joinRefresh`: a token refresh already started for the same change (the one a
// network-blip reconnect starts), which a recovered change joins instead of
// starting a second one.
function authorizationChanged(
  reason: BridgeAuthorizationChangeReason,
  joinRefresh?: Promise<unknown>,
): void {
  invalidateRouteGuardCache();
  if (REFRESHING_REASONS.has(reason)) refreshForAuthorizationChange(joinRefresh);
  for (const fn of _onAuthorizationChangeSubs) {
    try { fn(reason); } catch { /* subscriber errors swallowed */ }
  }
}

// TBP-654 (upgrade race) — the page shows a new plan as soon as
// `subscription.plan_changed` patches the store, but the access token that
// carries the new plan only arrives with the next refresh. That refresh used to
// start on `user.state_changed`, which the server publishes AFTER
// `plan_changed` (TBP-660), so a user who clicked into a plan-gated route the
// moment the page said "Pro" was judged on the old token and refused (2 of 6
// stage runs on bridge-svelte, which shares this wiring).
//
// So the events that change what the token says start the refresh immediately
// and register it as the pending authorization change the route guards wait
// for (bounded) before deciding. `token` is excluded: a new token IS the
// refreshed state. `flag` and `reconnect` are excluded: a flag definition is
// not in the token, and a reconnect refreshes on its own (see setOnOpen) —
// refreshing on every reconnect would loop through reauthorize().
const REFRESHING_REASONS: ReadonlySet<BridgeAuthorizationChangeReason> = new Set([
  'subscription.plan_changed',
  'entitlements.changed',
  'user.state_changed',
]);

// One refresh per burst: an event that arrives while one is in flight joins it
// (and auth-core's refreshTokens() dedupes as well). No loop: the refreshed
// token only re-runs `authorizationChanged('token')`, which never refreshes,
// and the reconnect it causes is flagged self-induced. A signed-out session has
// no token to refresh and no pending change.
function refreshForAuthorizationChange(joinRefresh?: Promise<unknown>): Promise<void> | undefined {
  if (!_currentAuthToken) return undefined;
  const pending = pendingAuthorizationChange();
  if (pending) return pending;
  if (joinRefresh) return trackAuthorizationChange(joinRefresh);
  let auth: ReturnType<typeof getBridgeAuth>;
  try {
    auth = getBridgeAuth();
  } catch {
    return undefined; // BridgeAuth not constructed — nothing to refresh with.
  }
  let refresh: Promise<unknown>;
  try {
    refresh = Promise.resolve(auth.refreshTokens());
  } catch (err) {
    refresh = Promise.reject(err);
  }
  return trackAuthorizationChange(refresh);
}

/** Same entitlement flags, regardless of key order. */
function sameEntitlements(
  a: Record<string, boolean> | null | undefined,
  b: Record<string, boolean>,
): boolean {
  if (!a) return false;
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((k) => a[k] === b[k]);
}

// TBP-660 — AppSync Events has no replay: anything published while the socket
// is down or being replaced is gone. The replacement is routine — a plan change
// sends `user.state_changed`, the runtime refreshes the token, the new token
// reauthorizes (close + reopen), and a `subscription.plan_changed` published
// during that swap never arrived (1 in 8 stage runs on bridge-svelte, which
// shares this wiring). So after EVERY open, the one reauthorize caused included,
// re-read what the pushes would have told us: `GET /billing/state`,
// `GET /entitlements`, `GET /session/init` and the hydrated quota metrics.
//
// TBP-686 — and on the FIRST open too. The server publishes `session.snapshot`
// fire-and-forget during authorize, before the subscription is live, so on a
// first connect it routinely loses the race and nothing replays it: tenant id,
// name, branding and user stayed null for the whole session. setOnOpen fires
// only once the subscribe is acknowledged, so anything published before that
// is already durable and the REST reads see it, and anything published after
// arrives on the socket.
//
// Loop safety: every request here uses the plain global `fetch` (this SDK never
// wraps it) with the token we already hold, and nothing here refreshes tokens,
// so the catch-up cannot itself cause another reauthorize.
interface CatchUpRequest {
  /** The client whose open asked for this. A stopped runtime's request is dropped. */
  rt: RealtimeClient;
  /** The token refresh the reconnect that asked for this started, if any
   *  (network blips do; our own reauthorize and the first connect do not). */
  reconnectRefresh?: Promise<unknown>;
}
let _catchUpInFlight: Promise<void> | undefined;
// Opens that land while a catch-up is in flight coalesce into ONE follow-up.
// Sharing the in-flight promise is not enough: its answer may have been read
// before the newest socket went live, so it cannot stand in for that socket's
// own catch-up. An open storm still costs at most two rounds of requests.
let _catchUpQueued: CatchUpRequest | undefined;
// A live push that lands while the catch-up fetch is in flight is newer than
// what the fetch may have read; the counters let the fetch result yield to it.
let _planPushSeq = 0;
let _entitlementsPushSeq = 0;

// `GET /usage/quota/:metric` — the body auth-core's own lazy hydrate reads, and
// the shape `applyInitialSnapshot` takes. `policy` and the TBP-275 overage
// fields are optional because an older bridge-api omits them.
type QuotaCatchUpBody =
  | (Omit<QuotaSnapshot, 'percent_used' | 'policy' | 'label'> & { policy?: 'hard' | 'metered' })
  | null;

function requestCatchUp(req: CatchUpRequest): void {
  if (!_currentAuthToken) return; // signed out: no workspace state to repair
  if (_catchUpInFlight) {
    _catchUpQueued = { rt: req.rt, reconnectRefresh: req.reconnectRefresh ?? _catchUpQueued?.reconnectRefresh };
    return;
  }
  // Every half is best-effort internally; the `.catch` is the backstop that
  // keeps a repair failure from surfacing as an unhandled rejection in the app.
  const run: Promise<void> = catchUp(req)
    .catch(() => { /* best-effort */ })
    .finally(() => {
      if (_catchUpInFlight !== run) return; // stopped meanwhile: the gate is no longer ours
      _catchUpInFlight = undefined;
      const next = _catchUpQueued;
      _catchUpQueued = undefined;
      if (next && next.rt === _realtime) requestCatchUp(next);
    });
  _catchUpInFlight = run;
}

async function catchUp({ rt, reconnectRefresh }: CatchUpRequest): Promise<void> {
  if (_realtime !== rt) return;
  let ctx: { apiBaseUrl: string; appId: string; accessToken: string | null };
  try {
    ctx = getBridgeAuth().getApiContext();
  } catch {
    return;
  }
  // The token the socket itself authenticates with (see getAuthToken below).
  const accessToken = _currentAuthToken;
  if (!accessToken) return;
  const apiBaseUrl = (ctx.apiBaseUrl ?? DEFAULT_API_BASE_URL).replace(/\/+$/, '');
  const headers = { Authorization: `Bearer ${accessToken}`, 'x-app-id': ctx.appId ?? '' };
  // Stopped, or the session changed while a read was in flight: the answer
  // describes a session we no longer have. A token change reauthorizes, and
  // that open catches up again with the right token.
  const stale = (): boolean => _realtime !== rt || _currentAuthToken !== accessToken;
  let billing: ReturnType<typeof useBillingBridge> | undefined;
  try { billing = useBillingBridge(); } catch { billing = undefined; }

  const planSeq = _planPushSeq;
  const entitlementsSeq = _entitlementsPushSeq;
  let planChanged = false;
  let entitlementsChanged = false;
  await Promise.all([
    (async () => {
      try {
        const state = await fetchBillingState({ apiBaseUrl, accessToken, appId: ctx.appId });
        if (!state || stale() || planSeq !== _planPushSeq) return;
        try { billing?.subscription.hydrate(state); } catch { /* defensive */ }
        const before = useSnapshotStore.getState().tenantSubscription;
        applySubscriptionState(state);
        // An empty slice is hydration, not a change (see applyCatchUpSnapshot).
        if (before && useSnapshotStore.getState().tenantSubscription?.plan?.slug !== before.plan?.slug) planChanged = true;
      } catch (err) {
        logger.debug('[bridge-runtime] catch-up: billing state skipped:', err);
      }
    })(),
    (async () => {
      try {
        const res = await fetch(`${apiBaseUrl}/entitlements`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!res.ok) return;
        const body = (await res.json()) as { entitlements?: unknown } | null;
        const map = body?.entitlements;
        if (!map || typeof map !== 'object' || Array.isArray(map)) return;
        if (stale() || entitlementsSeq !== _entitlementsPushSeq) return;
        try { billing?.entitlementsStore.applyEntitlementsChanged(map as Record<string, boolean>); } catch { /* defensive */ }
        const before = useSnapshotStore.getState().tenantEntitlements;
        applyEntitlementsChanged({ entitlements: map });
        if (before && !sameEntitlements(before, map as Record<string, boolean>)) entitlementsChanged = true;
      } catch (err) {
        logger.debug('[bridge-runtime] catch-up: entitlements skipped:', err);
      }
    })(),
    // TBP-686 — the session snapshot: tenant id/name, branding and user, which
    // nothing but `session.snapshot` ever writes.
    (async () => {
      try {
        const res = await fetch(`${apiBaseUrl}/session/init`, { method: 'GET', headers });
        if (!res.ok) return;
        const data = (await res.json()) as SessionSnapshotData | null;
        if (!data || stale()) return;
        // A live push that landed meanwhile is newer than this read: drop the
        // slice it covers and keep the rest.
        const tenant: Partial<SessionSnapshotData['tenant']> | undefined = data.tenant ? { ...data.tenant } : undefined;
        if (tenant && planSeq !== _planPushSeq) delete tenant.subscription;
        if (tenant && entitlementsSeq !== _entitlementsPushSeq) delete tenant.entitlements;
        const result = applyCatchUpSnapshot({ ...data, tenant } as SessionSnapshotData);
        if (result.planChanged) planChanged = true;
        if (result.entitlementsChanged) entitlementsChanged = true;
        if (tenant?.entitlements) {
          // Keep auth-core's copy (what flag targeting reads) in step too —
          // hydration included, which reports no change.
          try { billing?.entitlementsStore.applyEntitlementsChanged(tenant.entitlements); } catch { /* defensive */ }
        }
      } catch (err) {
        logger.debug('[bridge-runtime] catch-up: session snapshot skipped:', err);
      }
    })(),
    catchUpQuotaSnapshots(billing, apiBaseUrl, headers, stale),
  ]);
  // TBP-654 — a recovered change must reach the route guard exactly like the
  // push it replaces would have, including the token refresh the guard waits
  // for. It joins the refresh this reconnect already started, if any, so a
  // network blip still refreshes once. Nothing changed → nothing to redo, so
  // the reconnect the refreshed token causes cannot start another round.
  // Filling an empty slice is not a change: a delivered `session.snapshot`
  // never re-runs the guard or refreshes, so neither does its replacement.
  if (planChanged) authorizationChanged('subscription.plan_changed', reconnectRefresh);
  else if (entitlementsChanged) authorizationChanged('entitlements.changed', reconnectRefresh);
}

// TBP-686 — the same repair for the one live payload no snapshot carries:
// `quota.updated`. auth-core's QuotaStore fills a metric from a one-shot lazy
// `GET /usage/quota/:metric` on its first read, then only from live pushes — it
// never re-reads. So a push lost across a socket swap (every token refresh
// reauthorizes) froze `used` for the rest of the session, silently.
//
// Scope: only metrics the store has already hydrated. A page that never read a
// metric has nothing stale to repair, so this is one GET per watched metric per
// open, and nothing at all for apps that do not use quotas.
async function catchUpQuotaSnapshots(
  billing: ReturnType<typeof useBillingBridge> | undefined,
  apiBaseUrl: string,
  headers: Record<string, string>,
  stale: () => boolean,
): Promise<void> {
  let quotas: ReturnType<typeof useBillingBridge>['quotas'];
  let metrics: string[];
  try {
    quotas = billing!.quotas;
    metrics = [...quotas.getAll().keys()];
  } catch {
    return; // no billing bridge, or no quota surface — nothing to repair
  }
  if (metrics.length === 0) return;
  await Promise.all(
    metrics.map(async (metric) => {
      // The value this repair replaces. A live push that lands while the GET is
      // in flight is NEWER than the answer and must win — otherwise the repair
      // would reintroduce the very staleness it exists to fix.
      const before = quotas.getAll().get(metric);
      try {
        const res = await fetch(`${apiBaseUrl}/usage/quota/${encodeURIComponent(metric)}`, { method: 'GET', headers });
        if (!res.ok) return;
        const data = (await res.json()) as QuotaCatchUpBody;
        if (stale()) return;
        if (quotas.getAll().get(metric) !== before) return; // a push won the race
        // `null` is a real answer — "no quota configured for this metric" —
        // and applyInitialSnapshot drops the cached entry for it.
        quotas.applyInitialSnapshot(metric, data ?? null);
      } catch {
        // Best-effort, per metric: one failure must not skip the others.
      }
    }),
  );
}

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
    // TBP-644 — a refused connection gets ONE session refresh per episode
    // (auth-core enforces the once) and reconnects with the new token instead
    // of parking. A signed-out session has nothing to refresh. Loop safety:
    // the refreshed token lands in the token subscription below, whose
    // reauthorize() is a no-op while that episode is still connecting, and
    // the reconnect it produces is flagged self-induced so setOnOpen does not
    // refresh a second time.
    refreshAuthToken:
      options.realtime?.refreshAuthToken ??
      (async () => {
        if (!_currentAuthToken) return undefined;
        try {
          const tokens = await getBridgeAuth().refreshTokens();
          return tokens?.accessToken ?? undefined;
        } catch {
          return undefined;
        }
      }),
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
    let reconnectRefresh: Promise<unknown> | undefined;
    if (_connectedOnce && !causedByReauthorize) {
      reconnectRefresh = getBridgeAuth().refreshTokens().catch(() => { /* best-effort */ });
    }
    // TBP-654 — a reconnect drops the route-guard cache. The first connect has
    // no earlier verdict to distrust; it reports a change only if its catch-up
    // recovers one.
    if (_connectedOnce) authorizationChanged('reconnect');
    // TBP-660 / TBP-686 — every open, the first one included, may have missed
    // pushes (see requestCatchUp). The token refresh above stays skipped for a
    // self-induced reconnect and for the first connect: that is the loop
    // guard, and the catch-up never touches tokens.
    requestCatchUp({ rt: _realtime!, reconnectRefresh });
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

  // TBP-575 / TBP-644 — connected, handshaken, and subscribed to nothing.
  // Distinct from 'closed': no reconnect is coming, but nothing will arrive.
  // bridge-svelte wired this; nextjs never did, so a deaf connection read as
  // 'open' here. Guarded: an older auth-core has no such hook.
  _realtime.setOnDegraded?.(() => {
    _setRealtimeStatus('degraded');
  });

  // TBP-575 / TBP-654 — a realtime flag mutation makes the route-guard cache
  // stale. The FF 2.0 `BridgeFlags` store (`useFlag` / `<FeatureFlag>`) is
  // patched by the flag bundle's own attach; this is the other cache.
  _realtime.setOnFlagChange?.(() => {
    authorizationChanged('flag');
  });

  // TBP-644 — the full status: why the connection is not working, whose side
  // the fault is on, and whether it is still retrying. Guarded for the same
  // reason as setOnDegraded.
  _realtime.setOnStatusChange?.((status) => {
    _setRealtimeStatusDetail(status);
    // A parked client never opens, so a reauthorize that ended in a refusal
    // must not leave the self-induced flag set for the next genuine reconnect.
    if (status.state === 'unauthorized') _reauthInFlight = false;
    for (const fn of _onStatusSubs) {
      try { fn(status); } catch { /* subscriber errors swallowed */ }
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
    // TBP-654 — role/plan/attribute changes can flip a route verdict. This
    // starts the token refresh (or joins the one a preceding plan_changed
    // started).
    authorizationChanged('user.state_changed');
    for (const fn of _onUserStateSubs) {
      try { fn({ reason: msg.reason }); } catch { /* subscriber errors swallowed */ }
    }
    // Never rejects; a failed refresh is picked up by the next scheduled one.
    await pendingAuthorizationChange();
    // The refresh this joined may have been minted BEFORE the server bumped
    // the token version this message announces: a plan_changed that arrived
    // first started it, and the server bumps after publishing plan_changed.
    // Such a token carries the new plan but is `TOKEN_VERSION_STALE` for every
    // version-checked endpoint. One follow-up refresh, only when the token we
    // ended up with is behind the announced version — so it cannot loop, and
    // an older server that sends no version keeps the single refresh.
    const announced = (msg as { tokenVersion?: unknown }).tokenVersion;
    if (typeof announced === 'number') {
      const tv = decodeJwtPayload(_currentAuthToken ?? '')?.tv;
      if (typeof tv === 'number' && tv < announced) {
        await refreshForAuthorizationChange();
      }
    }
  });

  // Best-effort: bind the billing stores + billing-family events to this
  // realtime client so subscription / quotas / entitlements react to live
  // pushes and flow into the unified bridge events surface. Guarded — the
  // billing bridge is optional for the minimal core slice.
  try {
    const billing = useBillingBridge();
    billing.attachToRealtimeClient(_realtime);
    // TBP-644 — the two pushes that carry the complete new value also move the
    // `bridge.tenant.*` slices, which were otherwise written only by
    // `session.snapshot`. A plan change never re-sends a snapshot, so without
    // this an upgraded app kept rendering the old plan until a reload. The slice
    // is patched BEFORE dispatch so a `bridge.events` handler that reads
    // `bridge.tenant.subscription` already sees the new plan. Lifecycle events
    // are deliberately not mirrored: their payloads carry no status.
    billing.handle({
      'subscription.plan_changed': (m) => {
        _planPushSeq += 1; // newer than any in-flight reconnect catch-up (TBP-660)
        try { applySubscriptionPlanChanged(m); } catch { /* store updates shouldn't throw, defensive */ }
        authorizationChanged('subscription.plan_changed');
        bridgeEvents._dispatch(m);
      },
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
      'entitlements.changed': (m) => {
        // Only the payload-carrying variant has a map; the signal-only one is a no-op here.
        if ((m as { entitlements?: unknown }).entitlements) _entitlementsPushSeq += 1; // TBP-660
        try { applyEntitlementsChanged(m as { entitlements?: unknown }); } catch { /* defensive */ }
        authorizationChanged('entitlements.changed');
        bridgeEvents._dispatch(m);
      },
    });
  } catch (err) {
    logger.debug('[bridge-runtime] billing bridge attach skipped:', err);
  }

  // TBP-644 — the realtime connection must be re-authorized whenever the
  // token VALUE changes: rotation (A → B), but also first sign-in
  // (none → A) and sign-out (A → none). Keying this on rotation only meant a
  // session that signed in after page load kept the anonymous connection —
  // or stayed parked after a refusal — until something else reconnected it.
  // Flagged self-induced so setOnOpen skips its catch-up refresh (see the
  // loop note there): the token we reconnect with is already current.
  const reauthorizeForTokenChange = (): void => {
    _reauthInFlight = true;
    void _realtime!.reauthorize();
  };

  // Token subscription — owns realtime channel scoping + reauthorize on
  // any token change. Capability-specific subs are layered on top by their
  // own bootstrappers. `seed` is the value present before start(): start()
  // connects with it, so it is not a change.
  const applyTokens = (accessToken: string | null | undefined, seed = false): void => {
    const prevAuthToken = _currentAuthToken;
    _currentAuthToken = accessToken ?? undefined;
    const tokenChanged = !seed && prevAuthToken !== _currentAuthToken;

    // TBP-654 — a new token (sign-in, the refresh a plan change causes,
    // sign-out) invalidates every verdict taken with the old one.
    if (tokenChanged) authorizationChanged('token');

    if (!accessToken) {
      // Logout — drop user + workspace channel scopes. The app channel keeps
      // its anonymous app-id auth. Reconnect as the signed-out session now,
      // rather than riding the old user's socket until something drops it.
      _realtime!.setUserId(undefined);
      _realtime!.setWorkspaceId(undefined);
      if (tokenChanged) reauthorizeForTokenChange();
      return;
    }

    const claims = decodeJwtPayload(accessToken);
    if (claims) {
      _realtime!.setAppId(typeof claims.aid === 'string' ? claims.aid : undefined);
      _realtime!.setWorkspaceId(typeof claims.tid === 'string' ? claims.tid : undefined);
      _realtime!.setUserId(typeof claims.sub === 'string' ? claims.sub : undefined);
    }

    // setUserId is a no-op when the user is unchanged (token-only refresh),
    // and a setter-driven reconnect waits out a backoff and cannot lift a
    // parked refusal — so reauthorize explicitly on every value change.
    if (tokenChanged) reauthorizeForTokenChange();
  };

  // Seed from current token state, then subscribe for changes.
  applyTokens(useBridgeStore.getState().tokens?.accessToken ?? null, true);
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
 *
 * The module-level state is dropped **synchronously**, before the awaited
 * `client.stop()` flush. This matters for React 18/19 StrictMode — which
 * Next.js turns on by default (`reactStrictMode: true`): the dev-only
 * simulated remount runs the provider's cleanup and its re-mount effect back to
 * back in the same synchronous commit, so a `stop()` that only cleared
 * `_realtime` after its first `await` would still look "started" to the
 * immediately-following `startBridgeRuntime()` — which would bail out as a
 * no-op, and then the in-flight stop would land and leave the runtime dead.
 * Clearing up-front makes a synchronous stop→start pair actually restart.
 */
export async function stopBridgeRuntime(): Promise<void> {
  if (_unsubscribeAuth) {
    _unsubscribeAuth();
    _unsubscribeAuth = undefined;
  }
  const client = _realtime;
  _realtime = undefined;
  _currentAuthToken = undefined;
  // A queued catch-up follow-up must never fire into the next session; one in
  // flight drops its answer (it checks `_realtime`) and leaves the gate alone.
  _catchUpInFlight = undefined;
  _catchUpQueued = undefined;
  clearPendingAuthorizationChange();
  if (client) {
    try { await client.stop(); } catch { /* already stopped, ignore */ }
  }
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

/**
 * Subscribe to realtime status changes (TBP-644): state, the machine-readable
 * reason, whose side a fault is on (`app` / `config` / `bridge` / `network`),
 * whether the client is still retrying, a docs link and a support ref. Fires
 * on every change, not with the current value — read `realtimeStatusDetail` /
 * `useRealtimeStatusDetail()` for that. Returns an unsubscribe fn.
 */
export function onBridgeRealtimeStatus(handler: (status: RealtimeStatus) => void): () => void {
  _onStatusSubs.add(handler);
  return () => _onStatusSubs.delete(handler);
}

/** Subscribe to server-side `user.state_changed` signals. */
export function onBridgeRealtimeUserState(
  handler: (event: { reason: string }) => void,
): () => void {
  _onUserStateSubs.add(handler);
  return () => _onUserStateSubs.delete(handler);
}

/**
 * Subscribe to changes that can alter a route guard's verdict (TBP-654): plan
 * change, entitlements change, user state change, new access token, realtime
 * flag change. The route-guard cache is already invalidated when subscribers
 * run, so re-running `createRouteGuard(...).getNavigationDecision(pathname)`
 * from here re-evaluates against the server. Events arrive in bursts (a plan
 * change brings `entitlements.changed`, `user.state_changed` and a token
 * refresh within a second) — debounce any re-check. Returns an unsubscribe fn.
 */
export function onBridgeAuthorizationChange(
  handler: (reason: BridgeAuthorizationChangeReason) => void,
): () => void {
  _onAuthorizationChangeSubs.add(handler);
  return () => _onAuthorizationChangeSubs.delete(handler);
}

/** Test-only — reset module-level state between unit tests. */
export function __resetBridgeRuntime(): void {
  _onOpenSubs.clear();
  _onCloseSubs.clear();
  _onSnapshotSubs.clear();
  _onUserStateSubs.clear();
  _onStatusSubs.clear();
  _onAuthorizationChangeSubs.clear();
  _catchUpInFlight = undefined;
  _catchUpQueued = undefined;
  _currentAuthToken = undefined;
  clearPendingAuthorizationChange();
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
