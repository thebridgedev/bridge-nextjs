/**
 * @jest-environment jsdom
 *
 * TBP-660 — a reconnect repairs the billing + entitlement state, once.
 *
 * AppSync Events has no replay. A plan change sends `user.state_changed`, the
 * runtime refreshes the token, the new token reauthorizes (socket closed and
 * reopened), and a `subscription.plan_changed` published during that swap is
 * gone for good — seen in 1 of 8 stage runs on bridge-svelte, which shares this
 * wiring. The reconnect caused by our own reauthorize() skipped every catch-up
 * (that skip is the self-refresh loop guard), so nothing repaired the store.
 */
import { RealtimeClient, useBridge, type WebSocketLike } from '@nebulr-group/bridge-auth-core';
import {
  __resetBridgeRuntime,
  onBridgeAuthorizationChange,
  startBridgeRuntime,
  stopBridgeRuntime,
  type BridgeAuthorizationChangeReason,
} from './bridge-runtime';
import { _resetBridgeInstance, getBridgeAuth, initBridge, useBridgeStore } from './bridge-instance';
import { __resetSnapshotStores, applySessionSnapshot, useSnapshotStore } from './snapshot-stores';

class InertWebSocket implements WebSocketLike {
  readyState = 0;
  onopen: ((ev: unknown) => void) | null = null;
  onclose: ((ev: unknown) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  send(): void {}
  close(): void {
    this.readyState = 3;
  }
}

const API = 'http://api.test.local';
const realtimeFetch = (async (url: string) => {
  const ok = new URL(url).pathname === '/realtime/config';
  const body = ok ? { kind: 'appsync', endpoint: 'svc.appsync-realtime-api.eu-west-1.amazonaws.com' } : {};
  return { ok, status: ok ? 200 : 404, json: async () => body };
}) as unknown as typeof fetch;

function b64url(s: string): string {
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
let seq = 0;
function token(): string {
  seq += 1;
  const claims = { aid: 'app-1', tid: 't-1', sub: 'user-1', iat: seq, exp: Math.floor(Date.now() / 1000) + 3600 };
  return `${b64url(JSON.stringify({ alg: 'PS256' }))}.${b64url(JSON.stringify(claims))}.sig`;
}
function setTokens(accessToken: string | null): void {
  useBridgeStore.setState({ tokens: accessToken ? { accessToken, refreshToken: 'r' } : null } as never);
}

type Deferred<T> = { promise: Promise<T>; resolve: (v: T) => void };
function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}
const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

/** What the server says after the upgrade whose push was lost. */
const PRO_STATE = { plan: { slug: 'pro', name: 'Pro' }, status: 'active' };
const PRO_ENTITLEMENTS = { entitlements: { pro_reports: true, app_active: true } };

function jsonResponse(body: unknown) {
  const headers = { get: (k: string) => (k.toLowerCase() === 'content-type' ? 'application/json' : null) };
  return { ok: true, status: 200, statusText: 'OK', headers, json: async () => body, text: async () => JSON.stringify(body) };
}

describe('reconnect catch-up (TBP-660)', () => {
  let billing: Record<string, (msg: unknown) => void>;
  let apiFetch: jest.Mock;
  let refreshTokens: jest.SpyInstance;
  let reauthorize: jest.SpyInstance;
  let openSpy: jest.SpyInstance;
  const spies: Array<{ mockRestore(): void }> = [];
  let savedFetch: typeof fetch | undefined;
  // When set, `GET /billing/state` waits on it — the read is in flight.
  let billingGate: Deferred<unknown> | null = null;

  const open = () => (openSpy.mock.calls[openSpy.mock.calls.length - 1][0] as () => void)();
  const calls = (path: string) => apiFetch.mock.calls.filter(([url]) => new URL(String(url)).pathname === path).length;

  beforeEach(() => {
    __resetBridgeRuntime();
    _resetBridgeInstance();
    __resetSnapshotStores();
    setTokens(null);
    billingGate = null;
    initBridge({ appId: 'app-1', apiBaseUrl: API } as never);
    savedFetch = globalThis.fetch;
    apiFetch = jest.fn(async (url: string) => {
      const path = new URL(String(url)).pathname;
      if (path === '/billing/state') {
        if (billingGate) await billingGate.promise;
        return jsonResponse(PRO_STATE);
      }
      if (path === '/entitlements') return jsonResponse(PRO_ENTITLEMENTS);
      return { ok: false, status: 404, json: async () => ({}), text: async () => '' };
    });
    globalThis.fetch = apiFetch as unknown as typeof fetch;

    const auth = getBridgeAuth();
    refreshTokens = jest.spyOn(auth, 'refreshTokens').mockResolvedValue(null as never);
    reauthorize = jest.spyOn(RealtimeClient.prototype, 'reauthorize').mockResolvedValue(undefined as never);
    openSpy = jest.spyOn(RealtimeClient.prototype, 'setOnOpen');
    const billingBridge = useBridge();
    spies.push(
      refreshTokens,
      reauthorize,
      openSpy,
      jest.spyOn(billingBridge, 'handle').mockImplementation(((h: Record<string, (msg: unknown) => void>) => {
        billing = h;
        return () => {};
      }) as never),
      jest.spyOn(billingBridge, 'attachToRealtimeClient').mockImplementation((() => {}) as never),
    );

    // Signed in on Free, first connection open.
    setTokens(token());
    applySessionSnapshot({
      tenant: {
        id: 't-1',
        name: 'Acme',
        subscription: { plan: { slug: 'free', name: 'Free' }, status: 'active' },
        entitlements: { app_active: true },
      },
    } as never);
    startBridgeRuntime({
      realtime: { websocketFactory: () => new InertWebSocket(), fetchFn: realtimeFetch, reportStatus: false, diagnose: false },
    });
    open(); // initial connect
  });

  afterEach(async () => {
    await stopBridgeRuntime();
    for (const spy of spies.splice(0)) spy.mockRestore();
    globalThis.fetch = savedFetch as typeof fetch;
    __resetBridgeRuntime();
    setTokens(null);
  });

  it('the initial connect fetches nothing', async () => {
    await flush();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('a reconnect caused by our own reauthorize() catches up exactly once and repairs the stores', async () => {
    setTokens(token()); // the refresh user.state_changed causes → reauthorize()
    expect(reauthorize).toHaveBeenCalledTimes(1);
    refreshTokens.mockClear();

    open(); // the reauthorize-caused reconnect; plan_changed was published during the swap
    await flush();

    expect(calls('/billing/state')).toBe(1);
    expect(calls('/entitlements')).toBe(1);
    expect(useSnapshotStore.getState().tenantSubscription?.plan.slug).toBe('pro');
    expect(useSnapshotStore.getState().tenantEntitlements).toEqual(PRO_ENTITLEMENTS.entitlements);
    expect(useBridge().subscription.snapshot().state?.plan.slug).toBe('pro');
    expect(useBridge().entitlements.can('pro_reports')).toBe(true);
    // TBP-654 — the recovered plan change starts the token refresh the route
    // guard waits for, exactly like the lost push would have. Once.
    expect(refreshTokens).toHaveBeenCalledTimes(1);
    expect(reauthorize).toHaveBeenCalledTimes(1);

    // Loop guard intact: the refreshed token reauthorizes, and that reconnect's
    // catch-up finds nothing new — no second refresh.
    setTokens(token());
    expect(reauthorize).toHaveBeenCalledTimes(2);
    open();
    await flush();
    expect(calls('/billing/state')).toBe(2);
    expect(refreshTokens).toHaveBeenCalledTimes(1);
    expect(reauthorize).toHaveBeenCalledTimes(2);
  });

  it('a network-blip reconnect still refreshes the token, and catches up once', async () => {
    open(); // external reconnect
    await flush();

    // One refresh: the plan change the catch-up recovers joins the refresh the
    // reconnect itself started (TBP-654) rather than starting a second.
    expect(refreshTokens).toHaveBeenCalledTimes(1);
    expect(calls('/billing/state')).toBe(1);
    expect(calls('/entitlements')).toBe(1);
    expect(useSnapshotStore.getState().tenantSubscription?.plan.slug).toBe('pro');
  });

  it('a burst of reconnects while a catch-up is in flight shares one fetch', async () => {
    billingGate = deferred<unknown>();
    open();
    await flush();
    open();
    open();
    billingGate.resolve(undefined);
    await flush();

    expect(calls('/billing/state')).toBe(1);
    expect(calls('/entitlements')).toBe(1);
  });

  it('a live push that lands during the catch-up wins over the fetched state', async () => {
    billingGate = deferred<unknown>(); // /billing/state was read before the change
    open();
    await flush();
    expect(calls('/billing/state')).toBe(1);
    billing['subscription.plan_changed']({
      kind: 'subscription.plan_changed',
      tenantId: 't-1',
      from: { slug: 'pro' },
      to: { slug: 'enterprise', name: 'Enterprise' },
      status: 'active',
      effectiveAt: '2026-09-15T10:00:00.000Z',
    });
    billingGate.resolve(undefined); // ...and lands after the push
    await flush();

    expect(useSnapshotStore.getState().tenantSubscription?.plan.slug).toBe('enterprise');
  });

  it('a signed-out reconnect fetches nothing', async () => {
    setTokens(null);
    open();
    await flush();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('a reconnect also drops the route-guard cache (TBP-654)', async () => {
    const invalidate = jest.spyOn(getBridgeAuth(), 'invalidateFeatureFlagCache');
    spies.push(invalidate);
    const reasons: BridgeAuthorizationChangeReason[] = [];
    const off = onBridgeAuthorizationChange((r) => reasons.push(r));

    open();
    await flush();

    // The reconnect itself, then the plan change it recovered (Free → Pro).
    expect(reasons).toEqual(['reconnect', 'subscription.plan_changed']);
    expect(invalidate).toHaveBeenCalledTimes(2);
    off();
  });

  it('a reconnect that recovers nothing new starts no refresh (TBP-654)', async () => {
    open();
    await flush(); // recovers Free → Pro, refreshes once
    refreshTokens.mockClear();
    const reasons: BridgeAuthorizationChangeReason[] = [];
    const off = onBridgeAuthorizationChange((r) => reasons.push(r));

    setTokens(token()); // our own reauthorize → self-induced reconnect
    open();
    await flush();

    expect(calls('/billing/state')).toBe(2);
    expect(reasons).toEqual(['token', 'reconnect']);
    expect(refreshTokens).not.toHaveBeenCalled();
    off();
  });
});
