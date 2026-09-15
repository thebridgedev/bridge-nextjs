/**
 * @jest-environment jsdom
 *
 * TBP-654 — the route-guard flag cache is dropped by everything that can
 * change a route verdict, once per event, before app handlers see the event.
 *
 * Regression: `createRouteGuard` reads auth-core's FeatureFlagService (5-min
 * TTL). Nothing in bridge-nextjs ever invalidated it — not a plan change, not
 * a token refresh, not even a realtime flag change — so a Free user refused a
 * plan-gated route stayed refused after upgrading until the TTL ran out.
 * Reproduced on stage against bridge-svelte 0.8.0-beta.1, which shares this
 * wiring; port of bridge-svelte PR #56.
 */
import { RealtimeClient, useBridge, type WebSocketLike } from '@nebulr-group/bridge-auth-core';
import { bridgeEvents, type BridgeEventHandlers } from './events';
import {
  __resetBridgeRuntime,
  onBridgeAuthorizationChange,
  onBridgeRealtimeUserState,
  startBridgeRuntime,
  stopBridgeRuntime,
  type BridgeAuthorizationChangeReason,
} from './bridge-runtime';
import { _resetBridgeInstance, getBridgeAuth, initBridge, useBridgeStore } from './bridge-instance';
import { __resetSnapshotStores } from './snapshot-stores';

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
const fetchFn = (async (url: string) => {
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

const planChanged = {
  kind: 'subscription.plan_changed',
  tenantId: 't-1',
  from: { slug: 'free' },
  to: { slug: 'pro', name: 'Pro' },
  status: 'active',
  effectiveAt: '2026-09-15T10:00:00.000Z',
};

describe('route-guard cache invalidation (TBP-654)', () => {
  let billing: Record<string, (msg: unknown) => void>;
  let invalidate: jest.SpyInstance;
  let refreshTokens: jest.SpyInstance;
  const spies: Array<{ mockRestore(): void }> = [];
  const offs: Array<() => void> = [];
  const on = (handlers: BridgeEventHandlers) => offs.push(bridgeEvents.handle(handlers));

  /** The hook the runtime registered on the RealtimeClient via `setter`. */
  function hook<T extends (...args: never[]) => unknown>(spy: jest.SpyInstance): T {
    const calls = spy.mock.calls;
    return calls[calls.length - 1][0] as T;
  }
  let userStateSpy: jest.SpyInstance;
  let flagChangeSpy: jest.SpyInstance;

  function start(): void {
    startBridgeRuntime({
      realtime: { websocketFactory: () => new InertWebSocket(), fetchFn, reportStatus: false, diagnose: false },
    });
  }

  beforeEach(() => {
    __resetBridgeRuntime();
    _resetBridgeInstance();
    __resetSnapshotStores();
    setTokens(null);
    initBridge({ appId: 'app-1', apiBaseUrl: API } as never);
    const auth = getBridgeAuth();
    invalidate = jest.spyOn(auth, 'invalidateFeatureFlagCache');
    refreshTokens = jest.spyOn(auth, 'refreshTokens').mockResolvedValue(null as never);
    const billingBridge = useBridge();
    userStateSpy = jest.spyOn(RealtimeClient.prototype, 'setOnUserState');
    flagChangeSpy = jest.spyOn(RealtimeClient.prototype, 'setOnFlagChange');
    spies.push(
      invalidate,
      refreshTokens,
      userStateSpy,
      flagChangeSpy,
      jest.spyOn(billingBridge, 'handle').mockImplementation(((h: Record<string, (msg: unknown) => void>) => {
        billing = h;
        return () => {};
      }) as never),
      jest.spyOn(billingBridge, 'attachToRealtimeClient').mockImplementation((() => {}) as never),
    );
  });

  afterEach(async () => {
    for (const off of offs.splice(0)) off();
    await stopBridgeRuntime();
    for (const spy of spies.splice(0)) spy.mockRestore();
    __resetBridgeRuntime();
    setTokens(null);
  });

  it('subscription.plan_changed invalidates exactly once, before app handlers run', () => {
    start();
    const seenAtDispatch: number[] = [];
    on({ 'subscription.plan_changed': () => seenAtDispatch.push(invalidate.mock.calls.length) });
    invalidate.mockClear();

    billing['subscription.plan_changed'](planChanged);

    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(seenAtDispatch).toEqual([1]);
  });

  it('entitlements.changed invalidates exactly once, before app handlers run (map and signal-only)', () => {
    start();
    const seenAtDispatch: number[] = [];
    on({ 'entitlements.changed': () => seenAtDispatch.push(invalidate.mock.calls.length) });
    invalidate.mockClear();

    billing['entitlements.changed']({ kind: 'entitlements.changed', tenantId: 't-1', entitlements: { pro: true } });
    expect(seenAtDispatch).toEqual([1]);
    billing['entitlements.changed']({ kind: 'entitlements.changed', tenantId: 't-1' });
    expect(seenAtDispatch).toEqual([1, 2]);
    expect(invalidate).toHaveBeenCalledTimes(2);
  });

  it('user.state_changed invalidates exactly once, before subscribers and before the token refresh', async () => {
    start();
    const seenBySubscriber: number[] = [];
    onBridgeRealtimeUserState(() => seenBySubscriber.push(invalidate.mock.calls.length));
    invalidate.mockClear();
    refreshTokens.mockClear();

    await hook<(msg: unknown) => Promise<void>>(userStateSpy)({ kind: 'user.state_changed', reason: 'plan_changed' });

    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(seenBySubscriber).toEqual([1]);
    expect(refreshTokens).toHaveBeenCalledTimes(1);
    expect(invalidate.mock.invocationCallOrder[0]).toBeLessThan(refreshTokens.mock.invocationCallOrder[0]);
  });

  it('every access-token change invalidates once: sign-in, refresh, sign-out', () => {
    start();
    invalidate.mockClear();

    const a = token();
    setTokens(a); // sign-in: none → A
    expect(invalidate).toHaveBeenCalledTimes(1);
    setTokens(a); // same value → not a change
    expect(invalidate).toHaveBeenCalledTimes(1);
    setTokens(token()); // refresh: A → B (e.g. the refresh a plan change causes)
    expect(invalidate).toHaveBeenCalledTimes(2);
    setTokens(null); // sign-out
    expect(invalidate).toHaveBeenCalledTimes(3);
  });

  it('the token present at start is not a change', () => {
    setTokens(token());
    start();
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('a realtime flag change still invalidates (TBP-575), once per change', () => {
    start();
    invalidate.mockClear();

    hook<(change: unknown) => void>(flagChangeSpy)({ key: 'pro-page', kind: 'updated' });

    expect(invalidate).toHaveBeenCalledTimes(1);
  });

  it('onBridgeAuthorizationChange reports each trigger once, with the cache already dropped', async () => {
    start();
    const seen: Array<[BridgeAuthorizationChangeReason, number]> = [];
    invalidate.mockClear();
    const off = onBridgeAuthorizationChange((reason) => seen.push([reason, invalidate.mock.calls.length]));

    billing['subscription.plan_changed'](planChanged);
    billing['entitlements.changed']({ kind: 'entitlements.changed', tenantId: 't-1' });
    await hook<(msg: unknown) => Promise<void>>(userStateSpy)({ kind: 'user.state_changed', reason: 'plan_changed' });
    setTokens(token());
    hook<(change: unknown) => void>(flagChangeSpy)({ key: 'pro-page', kind: 'updated' });

    expect(seen).toEqual([
      ['subscription.plan_changed', 1],
      ['entitlements.changed', 2],
      ['user.state_changed', 3],
      ['token', 4],
      ['flag', 5],
    ]);

    off();
    billing['subscription.plan_changed'](planChanged);
    expect(seen).toHaveLength(5);
  });
});
