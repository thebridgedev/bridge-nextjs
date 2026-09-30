/**
 * @jest-environment jsdom
 *
 * TBP-644 — the bridge runtime ↔ realtime client contract, driven through the
 * REAL auth-core RealtimeClient with a fake WebSocket + fetch.
 *
 * 1. The runtime reauthorized only on token ROTATION (A → B). A session that
 *    signed in after page load (none → A) kept the anonymous connection, and a
 *    client parked after a refusal stayed parked until something else
 *    reconnected it. It must reauthorize on every change of the token value.
 * 2. That must not reopen the self-induced refresh loop (TBP-644). Since
 *    TBP-700 every connect reconciles the token ONCE; a token that carries the
 *    same authority never replaces the socket, so the loop cannot start.
 * 3. `refreshAuthToken` is wired, and the reconnect it causes reconciles once
 *    without replacing the socket again.
 * 4. The full RealtimeStatus reaches the public API; 'degraded' is wired.
 */
import type { RealtimeStatus, WebSocketLike } from '@nebulr-group/bridge-auth-core';
import {
  __resetBridgeRuntime,
  getBridgeRealtime,
  onBridgeRealtimeStatus,
  startBridgeRuntime,
  stopBridgeRuntime,
} from './bridge-runtime';
import { _resetBridgeInstance, getBridgeAuth, initBridge, useBridgeStore } from './bridge-instance';
import { _setRealtimeStatusDetail, realtimeStatus, realtimeStatusDetail } from './realtime-status';

// ── Fakes ───────────────────────────────────────────────────────────────────

class FakeWebSocket implements WebSocketLike {
  static instances: FakeWebSocket[] = [];
  readyState = 0;
  sent: string[] = [];
  onopen: ((ev: unknown) => void) | null = null;
  onclose: ((ev: unknown) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  constructor(public url: string, public protocols?: string | string[]) {
    FakeWebSocket.instances.push(this);
  }
  send(data: string) {
    this.sent.push(data);
  }
  close(code?: number) {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.onclose?.({ code });
  }
  message(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
}

const API = 'http://api.test.local';
const APPSYNC_HOST = 'svc.appsync-realtime-api.eu-west-1.amazonaws.com';

const fetchFn = (async (url: string) => {
  const path = new URL(url).pathname;
  const ok = path === '/realtime/config';
  const body = ok ? { kind: 'appsync', endpoint: APPSYNC_HOST } : {};
  return { ok, status: ok ? 200 : 404, json: async () => body };
}) as unknown as typeof fetch;

function b64url(s: string): string {
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
let tokenSeq = 0;
function token(sub = 'user-1', extra: Record<string, unknown> = {}): string {
  tokenSeq += 1;
  const claims = {
    iss: `${API}/auth`,
    aid: 'app-1',
    tid: 't-1',
    sub,
    iat: tokenSeq,
    exp: Math.floor(Date.now() / 1000) + 3600,
    ...extra,
  };
  return `${b64url(JSON.stringify({ alg: 'PS256' }))}.${b64url(JSON.stringify(claims))}.sig`;
}

function setTokens(accessToken: string | null): void {
  useBridgeStore.setState({ tokens: accessToken ? { accessToken, refreshToken: 'r' } : null } as never);
}

/** Authorization the socket presented in its AppSync `header-…` subprotocol. */
function presented(ws: FakeWebSocket): string {
  const list = Array.isArray(ws.protocols) ? ws.protocols : [ws.protocols ?? ''];
  const header = list.find((p) => p.startsWith('header-'))!.slice('header-'.length);
  const padded = header.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((header.length + 3) % 4);
  return JSON.parse(atob(padded)).Authorization;
}

function connectOk(ws: FakeWebSocket): void {
  ws.readyState = 1;
  ws.onopen?.({});
  ws.message({ type: 'connection_ack' });
  for (const raw of ws.sent) {
    const f = JSON.parse(raw);
    if (f.type === 'subscribe') ws.message({ type: 'subscribe_success', id: f.id });
  }
}

function refuse(ws: FakeWebSocket): void {
  ws.readyState = 1;
  ws.onopen?.({});
  ws.message({ type: 'connection_error', errors: [{ errorType: 'UnauthorizedException', errorCode: 401 }] });
}

const settle = async (ms = 20) => {
  for (let i = 0; i < 3; i++) await new Promise((r) => setTimeout(r, ms / 3));
};
const lastWs = () => FakeWebSocket.instances[FakeWebSocket.instances.length - 1];

let reauthCalls = 0;
let refreshCalls = 0;
let refreshArgs: unknown[] = [];
let refreshImpl: () => Promise<{ accessToken: string } | null> = async () => null;

async function start(): Promise<void> {
  startBridgeRuntime({
    realtime: {
      websocketFactory: (u, p) => new FakeWebSocket(u, p),
      fetchFn,
      reportStatus: false,
      diagnose: false,
      reconnectBaseMs: 5,
    },
  });
  const rt = getBridgeRealtime()!;
  const original = rt.reauthorize.bind(rt);
  rt.reauthorize = async () => {
    reauthCalls += 1;
    return original();
  };
  await settle();
}

const realError = console.error;
beforeAll(() => {
  // auth-core logs the (expected) refusals at error level; keep the run readable.
  console.error = () => {};
  (globalThis as unknown as { fetch: unknown }).fetch = () => Promise.reject(new Error('offline'));
});
afterAll(() => {
  console.error = realError;
});

beforeEach(() => {
  __resetBridgeRuntime();
  _resetBridgeInstance();
  FakeWebSocket.instances = [];
  reauthCalls = 0;
  refreshCalls = 0;
  refreshArgs = [];
  refreshImpl = async () => null;
  _setRealtimeStatusDetail({ state: 'idle', retrying: false, since: 0 });
  initBridge({ appId: 'app-1', apiBaseUrl: API } as never);
  setTokens(null);
  (getBridgeAuth() as unknown as { refreshTokens: (o?: unknown) => Promise<unknown> }).refreshTokens = async (o?: unknown) => {
    refreshCalls += 1;
    refreshArgs.push(o);
    return refreshImpl();
  };
});

afterEach(async () => {
  await stopBridgeRuntime();
  __resetBridgeRuntime();
});

describe('reauthorizes on every token value change (TBP-644)', () => {
  it('first sign-in (no token → token) reconnects with the user token', async () => {
    await start();
    connectOk(lastWs());
    expect(presented(lastWs())).toBe('anonymous');

    const t = token();
    setTokens(t);
    expect(reauthCalls).toBe(1);
    await settle();
    expect(presented(lastWs())).toBe(`Bearer ${t}`);
  });

  it('a signed-out session parked after a refusal resumes as soon as the user signs in', async () => {
    await start();
    refuse(lastWs());
    await settle();
    expect(getBridgeRealtime()!.getState()).toBe('unauthorized');
    const before = FakeWebSocket.instances.length;

    const t = token();
    setTokens(t);
    await settle();
    // Resumes NOW — not after auth-core's 5 s parked-token poll.
    expect(FakeWebSocket.instances.length).toBe(before + 1);
    expect(presented(lastWs())).toBe(`Bearer ${t}`);
  });

  it('sign-out (token → no token) reconnects as the signed-out session', async () => {
    setTokens(token());
    await start();
    connectOk(lastWs());
    setTokens(null);
    expect(reauthCalls).toBe(1);
    await settle();
    expect(presented(lastWs())).toBe('anonymous');
  });

  it('the token already present at start is not a change — start() connects with it', async () => {
    const t = token();
    setTokens(t);
    await start();
    expect(reauthCalls).toBe(0);
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(presented(lastWs())).toBe(`Bearer ${t}`);
  });
});

/** The server mints a new token on every refresh: `claims` say what it carries. */
function mintOnRefresh(claims: Record<string, unknown> = {}): void {
  refreshImpl = async () => {
    const t = token('user-1', claims);
    setTokens(t);
    return { accessToken: t };
  };
}

describe('the self-induced refresh loop guard still holds (TBP-644, TBP-700)', () => {
  it('every connect reconciles once; a token with the same authority never replaces the socket', async () => {
    mintOnRefresh(); // only iat moves: nothing changed on the server
    await start();
    connectOk(lastWs());
    await settle();
    expect(refreshCalls).toBe(0); // signed out: no user state to reconcile

    setTokens(token()); // sign-in → reauthorize
    expect(reauthCalls).toBe(1);
    await settle();
    connectOk(lastWs()); // the reconnect our own reauthorize caused
    await settle();
    // TBP-700 — it reconciles, with a refresh minted after the channels were live...
    expect(refreshArgs).toEqual([{ fresh: true }]);
    // ...and the new token carries the same authority: no swap, so no loop.
    expect(reauthCalls).toBe(1);
    const sockets = FakeWebSocket.instances.length;

    lastWs().close(1006); // a genuine reconnect reconciles once too
    await settle(40);
    connectOk(lastWs());
    await settle();
    expect(refreshCalls).toBe(2);
    expect(reauthCalls).toBe(1);
    expect(FakeWebSocket.instances.length).toBe(sockets + 1); // the reconnect itself, nothing more
  });

  it('a role change lost during a socket swap is recovered: one re-authorize with the new token, then quiet', async () => {
    setTokens(token('user-1', { role: 'MEMBER', tv: 1 }));
    await start();
    // The server moved on (user.state_changed published while we were not listening).
    mintOnRefresh({ role: 'ADMIN', tv: 2 });
    connectOk(lastWs());
    await settle();
    expect(reauthCalls).toBe(1);
    await settle();
    const claims = JSON.parse(atob(presented(lastWs()).split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    expect(claims.role).toBe('ADMIN');

    // The replacement socket reconciles again and finds nothing new.
    connectOk(lastWs());
    await settle();
    expect(refreshCalls).toBe(2);
    expect(reauthCalls).toBe(1);
  });

  it('a claim that differs on every mint cannot turn the reconcile into a reconnect loop', async () => {
    let n = 0;
    refreshImpl = async () => {
      n += 1;
      const t = token('user-1', { nonce: n });
      setTokens(t);
      return { accessToken: t };
    };
    setTokens(token());
    await start();
    for (let i = 0; i < 8; i++) {
      connectOk(lastWs());
      await settle();
    }
    expect(reauthCalls).toBeLessThanOrEqual(3);
  });
});

describe('refreshAuthToken is wired (TBP-644)', () => {
  it('a refused session refreshes once, reconnects with the NEW token, and the reconnect does not replace it again', async () => {
    setTokens(token());
    await start();
    connectOk(lastWs());
    await settle();
    refreshCalls = 0; // the first connect's reconcile (TBP-700)
    refreshArgs = [];
    lastWs().close(1006);
    await settle(40);

    const fresh = token();
    refreshImpl = async () => {
      setTokens(fresh);
      return { accessToken: fresh };
    };
    refuse(lastWs());
    await settle();
    expect(refreshCalls).toBe(1);
    expect(presented(lastWs())).toBe(`Bearer ${fresh}`);

    const sockets = FakeWebSocket.instances.length;
    connectOk(lastWs());
    await settle();
    expect(getBridgeRealtime()!.getState()).toBe('open');
    // TBP-700 — the reconnect reconciles once (same token back: nothing new)
    // and keeps the socket it just subscribed.
    expect(refreshCalls).toBe(2);
    expect(refreshArgs[1]).toEqual({ fresh: true });
    expect(FakeWebSocket.instances.length).toBe(sockets);
  });

  it('a signed-out session has nothing to refresh', async () => {
    await start();
    refuse(lastWs());
    await settle();
    expect(refreshCalls).toBe(0);
  });
});

describe('the full realtime status reaches the public API (TBP-644)', () => {
  it("propagates 'unauthorized' with reason, side, docs link and ref", async () => {
    const seen: RealtimeStatus[] = [];
    onBridgeRealtimeStatus((s) => seen.push(s));
    let detail: RealtimeStatus | undefined;
    let state: string | undefined;
    const offDetail = realtimeStatusDetail.subscribe((d) => (detail = d));
    const offState = realtimeStatus.subscribe((s) => (state = s));

    setTokens(token());
    await start();
    refuse(lastWs());
    await settle();

    expect(state).toBe('unauthorized');
    expect(detail?.state).toBe('unauthorized');
    expect(typeof detail?.reason).toBe('string');
    expect(typeof detail?.side).toBe('string');
    expect(detail?.retrying).toBe(false);
    expect(detail?.docsUrl).toContain(`#${detail?.reason}`);
    expect(typeof detail?.ref).toBe('string');
    expect(seen[seen.length - 1]).toEqual(detail);
    offDetail();
    offState();
  });

  it("reports 'degraded' when every channel subscription is rejected", async () => {
    await start();
    const ws = lastWs();
    ws.readyState = 1;
    ws.onopen?.({});
    ws.message({ type: 'connection_ack' });
    for (const raw of ws.sent) {
      const f = JSON.parse(raw);
      if (f.type === 'subscribe') ws.message({ type: 'subscribe_error', id: f.id, errors: [{ errorType: 'X' }] });
    }
    let state: string | undefined;
    const off = realtimeStatus.subscribe((s) => (state = s));
    expect(state).toBe('degraded');
    off();
  });
});
