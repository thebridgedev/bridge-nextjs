/**
 * @jest-environment jsdom
 *
 * TBP-686 — the catch-up runs on EVERY open, the first one included, and it
 * repairs the session snapshot and the hydrated quota metrics as well.
 *
 * The server publishes `session.snapshot` fire-and-forget during authorize,
 * before the subscription is live, so on a first connect it routinely loses the
 * race and nothing replays it: `bridge.tenant.id/name`, branding and user stayed
 * null for the whole session, because the only repair was gated on
 * `_connectedOnce`. Separately, auth-core's QuotaStore never re-reads a metric
 * after its first lazy hydrate, so a `quota.updated` push lost across a socket
 * swap froze `used` for the session. Ported from bridge-svelte 0.8.3.
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
  const claims = { aid: 'app-1', tid: 'ws-1', sub: 'user-1', iat: seq, exp: Math.floor(Date.now() / 1000) + 3600 };
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
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

function jsonResponse(body: unknown) {
  const headers = { get: (k: string) => (k.toLowerCase() === 'content-type' ? 'application/json' : null) };
  return { ok: true, status: 200, statusText: 'OK', headers, json: async () => body, text: async () => JSON.stringify(body) };
}

/** What the server says — and, in the "nothing new" cases, what the page already has. */
const SNAPSHOT = {
  app: { branding: { logo: '', name: 'App' } },
  tenant: {
    id: 'ws-1',
    name: 'Workspace',
    subscription: { plan: { slug: 'free', name: 'Free' }, status: 'active' },
    entitlements: { app_active: true },
  },
  user: { id: 'user-1', role: 'OWNER', tenantId: 'ws-1' },
};
const BILLING_STATE = { plan: { slug: 'free', name: 'Free' }, status: 'active' };
/** The same session after an upgrade whose push was lost. */
const PRO_SNAPSHOT = {
  ...SNAPSHOT,
  tenant: {
    ...SNAPSHOT.tenant,
    subscription: { plan: { slug: 'pro', name: 'Pro' }, status: 'active' },
    entitlements: { app_active: true, pro_reports: true },
  },
};
const PRO_BILLING_STATE = { plan: { slug: 'pro', name: 'Pro' }, status: 'active' };

const hydrated = (metric: string, used: number) => ({ metric, used, limit: 100, remaining: 100 - used });

describe('every open catches up, the first one included (TBP-686)', () => {
  let billing: Record<string, (msg: unknown) => void>;
  let apiFetch: jest.Mock;
  let refreshTokens: jest.SpyInstance;
  let reauthorize: jest.SpyInstance;
  let openSpy: jest.SpyInstance;
  const spies: Array<{ mockRestore(): void }> = [];
  let savedFetch: typeof fetch | undefined;
  // When set, the matching GET waits on it — the read is in flight.
  let sessionGate: Deferred<unknown> | null = null;
  let quotaGate: Deferred<unknown> | null = null;
  let quotaAnswer: unknown = null;
  // What the server says: Free unless a test upgrades it.
  let upgraded = false;

  const open = () => (openSpy.mock.calls[openSpy.mock.calls.length - 1][0] as () => void)();
  const paths = () => apiFetch.mock.calls.map(([url]) => new URL(String(url)).pathname);
  const calls = (path: string) => paths().filter((p) => p === path).length;
  const start = () =>
    startBridgeRuntime({
      realtime: { websocketFactory: () => new InertWebSocket(), fetchFn: realtimeFetch, reportStatus: false, diagnose: false },
    });

  beforeEach(() => {
    __resetBridgeRuntime();
    _resetBridgeInstance();
    __resetSnapshotStores();
    setTokens(null);
    sessionGate = null;
    quotaGate = null;
    quotaAnswer = null;
    upgraded = false;
    initBridge({ appId: 'app-1', apiBaseUrl: API } as never);
    savedFetch = globalThis.fetch;
    apiFetch = jest.fn(async (url: string) => {
      const path = new URL(String(url)).pathname;
      const snap = upgraded ? PRO_SNAPSHOT : SNAPSHOT;
      if (path === '/billing/state') return jsonResponse(upgraded ? PRO_BILLING_STATE : BILLING_STATE);
      if (path === '/entitlements') return jsonResponse({ entitlements: snap.tenant.entitlements });
      if (path === '/session/init') {
        if (sessionGate) await sessionGate.promise;
        return jsonResponse(snap);
      }
      if (path.startsWith('/usage/quota/')) {
        if (quotaGate) await quotaGate.promise;
        return jsonResponse(quotaAnswer);
      }
      return { ok: false, status: 404, json: async () => ({}), text: async () => '' };
    });
    globalThis.fetch = apiFetch as unknown as typeof fetch;

    const auth = getBridgeAuth();
    refreshTokens = jest.spyOn(auth, 'refreshTokens').mockResolvedValue(null as never);
    reauthorize = jest.spyOn(RealtimeClient.prototype, 'reauthorize').mockResolvedValue(undefined as never);
    openSpy = jest.spyOn(RealtimeClient.prototype, 'setOnOpen');
    const billingBridge = useBridge();
    billingBridge.quotas.__resetForTests();
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
  });

  afterEach(async () => {
    await stopBridgeRuntime();
    for (const spy of spies.splice(0)) spy.mockRestore();
    globalThis.fetch = savedFetch as typeof fetch;
    useBridge().quotas.__resetForTests();
    __resetBridgeRuntime();
    setTokens(null);
  });

  it('the first connect fetches /session/init and fills the tenant, branding and user', async () => {
    const t = token();
    setTokens(t);
    start();
    open(); // first connect; the session.snapshot push lost the race
    await flush();

    const call = apiFetch.mock.calls.find(([url]) => new URL(String(url)).pathname === '/session/init');
    expect(call).toBeDefined();
    expect(call![1].headers).toMatchObject({ Authorization: `Bearer ${t}`, 'x-app-id': 'app-1' });
    const s = useSnapshotStore.getState();
    expect(s.tenantId).toBe('ws-1');
    expect(s.tenantName).toBe('Workspace');
    expect(s.appBranding).toEqual(SNAPSHOT.app.branding);
    expect(s.user).toEqual(SNAPSHOT.user);
  });

  // Filling an empty store is hydration, not a change: a delivered
  // `session.snapshot` push never re-runs the route guard or refreshes the
  // token, so the catch-up that replaces a lost one must not either — or most
  // page loads would refresh the token and swap the socket.
  it('a first connect into empty stores fills them and reports no change and no refresh', async () => {
    setTokens(token());
    start();
    const reasons: BridgeAuthorizationChangeReason[] = [];
    const off = onBridgeAuthorizationChange((r) => reasons.push(r));
    open();
    await flush();

    const s = useSnapshotStore.getState();
    expect(s.tenantId).toBe('ws-1');
    expect(s.tenantName).toBe('Workspace');
    expect(s.tenantSubscription?.plan.slug).toBe('free');
    expect(s.tenantEntitlements).toEqual(SNAPSHOT.tenant.entitlements);
    expect(useBridge().entitlements.can('app_active')).toBe(true); // auth-core kept in step
    expect(reasons).toEqual([]);
    expect(refreshTokens).not.toHaveBeenCalled();
    expect(reauthorize).not.toHaveBeenCalled();
    off();
  });

  it('a first connect that finds a different plan than the page held reports it and refreshes once (TBP-654)', async () => {
    applySessionSnapshot(SNAPSHOT as never); // the page rendered Free...
    upgraded = true; // ...and the server already says Pro
    setTokens(token());
    start();
    const reasons: BridgeAuthorizationChangeReason[] = [];
    const off = onBridgeAuthorizationChange((r) => reasons.push(r));
    open();
    await flush();

    expect(useSnapshotStore.getState().tenantSubscription?.plan.slug).toBe('pro');
    expect(reasons).toEqual(['subscription.plan_changed']);
    expect(refreshTokens).toHaveBeenCalledTimes(1);
    off();
  });

  it('a reconnect that finds a different plan still reports it and refreshes once', async () => {
    setTokens(token());
    start();
    open(); // first connect: hydrates Free, nothing to report
    await flush();
    expect(refreshTokens).not.toHaveBeenCalled();
    upgraded = true; // the plan_changed push is lost during the swap
    const reasons: BridgeAuthorizationChangeReason[] = [];
    const off = onBridgeAuthorizationChange((r) => reasons.push(r));

    setTokens(token()); // our own reauthorize
    open(); // the replacement socket
    await flush();

    expect(useSnapshotStore.getState().tenantSubscription?.plan.slug).toBe('pro');
    expect(reasons).toEqual(['token', 'reconnect', 'subscription.plan_changed']);
    expect(refreshTokens).toHaveBeenCalledTimes(1);
    off();
  });

  it('the first connect does not refresh the token, and with nothing new reports no authorization change', async () => {
    applySessionSnapshot(SNAPSHOT as never); // the push did arrive: nothing to repair
    setTokens(token());
    start();
    const reasons: BridgeAuthorizationChangeReason[] = [];
    const off = onBridgeAuthorizationChange((r) => reasons.push(r));
    open();
    await flush();

    expect(calls('/session/init')).toBe(1);
    expect(refreshTokens).not.toHaveBeenCalled();
    expect(reauthorize).not.toHaveBeenCalled();
    // No 'reconnect' on a first connect, and no recovered change either.
    expect(reasons).toEqual([]);
    off();
  });

  it('a signed-out first connect makes no requests', async () => {
    start();
    open();
    await flush();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('a plan push that lands while /session/init is in flight wins over the fetched snapshot', async () => {
    applySessionSnapshot(SNAPSHOT as never);
    setTokens(token());
    start();
    sessionGate = deferred<unknown>(); // read before the upgrade...
    open();
    await flush();
    billing['subscription.plan_changed']({
      kind: 'subscription.plan_changed',
      tenantId: 'ws-1',
      from: { slug: 'free' },
      to: { slug: 'pro', name: 'Pro' },
      status: 'active',
      effectiveAt: '2026-09-25T10:00:00.000Z',
    });
    sessionGate.resolve(undefined); // ...and answers after the push
    await flush();

    expect(useSnapshotStore.getState().tenantSubscription?.plan.slug).toBe('pro');
  });

  it('opens that land while a catch-up is in flight queue exactly ONE follow-up', async () => {
    setTokens(token());
    start();
    sessionGate = deferred<unknown>();
    open(); // catch-up #1 in flight
    await flush();
    open();
    open();
    open(); // three reconnects meanwhile
    expect(calls('/session/init')).toBe(1);
    const gate = sessionGate;
    sessionGate = null;
    gate.resolve(undefined);
    await flush();
    await flush();
    expect(calls('/session/init')).toBe(2);
    await flush();
    expect(calls('/session/init')).toBe(2);
  });

  it('a follow-up queued before stop never fires into the next session', async () => {
    setTokens(token());
    start();
    sessionGate = deferred<unknown>();
    open(); // in flight
    await flush();
    open(); // follow-up queued behind it
    const gate = sessionGate;
    await stopBridgeRuntime();
    setTokens(token());
    start(); // the next session on the same module state
    open(); // its own first connect — waits on the same gate
    await flush();
    sessionGate = null;
    gate.resolve(undefined);
    await flush();
    await flush();
    // One for the stopped runtime's in-flight read, one for the new runtime's
    // own connect — the stopped runtime's queued follow-up adds nothing.
    expect(calls('/session/init')).toBe(2);
  });

  // ── Quota catch-up ───────────────────────────────────────────────────────

  it('re-reads only the hydrated quota metrics and applies the answers', async () => {
    const quotas = useBridge().quotas;
    quotas.applyInitialSnapshot('ai_completions', hydrated('ai_completions', 10));
    quotaAnswer = hydrated('ai_completions', 42);
    setTokens(token());
    start();
    open();
    await flush();

    expect(paths().filter((p) => p.startsWith('/usage/quota/'))).toEqual(['/usage/quota/ai_completions']);
    const call = apiFetch.mock.calls.find(([url]) => String(url).includes('/usage/quota/'));
    expect(call![1].headers).toMatchObject({ 'x-app-id': 'app-1' });
    expect(quotas.getAll().get('ai_completions')).toMatchObject({ used: 42 });
  });

  it('a quota push that lands while the GET is in flight wins', async () => {
    const quotas = useBridge().quotas;
    quotas.applyInitialSnapshot('ai_completions', hydrated('ai_completions', 10));
    quotaAnswer = hydrated('ai_completions', 42);
    quotaGate = deferred<unknown>();
    setTokens(token());
    start();
    open();
    await flush();
    expect(calls('/usage/quota/ai_completions')).toBe(1);

    quotas.applyQuotaUpdated({ kind: 'quota.updated', ...hydrated('ai_completions', 77) } as never);
    quotaGate.resolve(undefined);
    await flush();

    expect(quotas.getAll().get('ai_completions')).toMatchObject({ used: 77 });
  });

  it('an app that never read a quota issues no quota request', async () => {
    expect(useBridge().quotas.getAll().size).toBe(0);
    setTokens(token());
    start();
    open();
    await flush();
    expect(calls('/session/init')).toBe(1);
    expect(paths().some((p) => p.startsWith('/usage/quota/'))).toBe(false);
  });
});
