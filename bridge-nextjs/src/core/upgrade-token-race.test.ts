/**
 * @jest-environment jsdom
 *
 * Regression (TBP-654, upgrade race) — found by the M33 clean-room smoke on
 * stage against bridge-svelte, which shares this wiring, 2 of 6 runs:
 *
 *   +484 ms  subscription.plan_changed → the page shows "Pro"
 *   +489 ms  the user clicks into the plan-gated /pro
 *            → the route guard evaluates the plan-targeted rule with the OLD
 *              (Free) access token → refused, bounced to /dashboard
 *   +774 ms  the token refresh (started by user.state_changed) lands
 *
 * Real runtime + real route-guard wrapper + real guard cache. Only the edges
 * are faked: BridgeAuth (token store, refresh, the rule check, which answers
 * from the plan claim of whatever token is current) and auth-core's realtime
 * client (so the test can deliver the pushes). Timers are fake so the bound is
 * exact. Port of bridge-svelte's upgrade-token-race.test.ts (PR #62).
 */

type Tokens = { accessToken: string } | null;

const mockH = {
  store: undefined as unknown as {
    getState(): { tokens: Tokens };
    setState(s: { tokens: Tokens }): void;
    subscribe(fn: (s: { tokens: Tokens }) => void): () => void;
  },
  refreshCalls: 0,
  refreshImpl: (() => Promise.resolve(null)) as () => Promise<unknown>,
  // Which token each /pro rule evaluation ran with.
  evaluatedWith: [] as Array<string | null>,
  checkDelayMs: 0,
  billing: undefined as undefined | Record<string, (msg: unknown) => void>,
  onUserState: undefined as undefined | ((msg: Record<string, unknown>) => Promise<void>),
};

jest.mock('./bridge-instance', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { create } = require('zustand');
  // Factory-local: jest hoists this factory above `mockH`'s initialisation, so
  // nothing here may touch `mockH` until a function runs.
  const store = create(() => ({ tokens: null }));
  const current = (): string | null => store.getState().tokens?.accessToken ?? null;
  const planOf = (token: string | null): unknown => {
    try {
      return token ? JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).plan : null;
    } catch {
      return null;
    }
  };
  const isPublic = (p: string) => p === '/' || p.startsWith('/auth');
  const auth = {
    getApiContext: () => ({ appId: 'app-1', apiBaseUrl: 'http://test', accessToken: current() }),
    isAuthenticated: () => !!current(),
    refreshTokens: () => {
      mockH.refreshCalls += 1;
      return mockH.refreshImpl();
    },
    invalidateFeatureFlagCache: () => {},
    createRouteGuard: () => ({
      isPublicRoute: isPublic,
      shouldRedirectToLogin: (p: string) => !isPublic(p) && !current(),
      // `/pro` is gated on flag `pro-page` = `tenant.plan in [pro]`, and the
      // server reads the plan from the token the SDK sends.
      async checkRouteRestrictions(p: string) {
        if (p !== '/pro') return null;
        const token = current();
        if (mockH.checkDelayMs) await new Promise((r) => setTimeout(r, mockH.checkDelayMs));
        mockH.evaluatedWith.push(token);
        return planOf(token) === 'pro' ? null : '/dashboard';
      },
      getLoginRedirect: () => 'https://hosted.example/login',
      resolveReturnTo: (attempted: string) => attempted,
    }),
  };
  return {
    getBridgeAuth: () => auth,
    useBridgeStore: store,
  };
});

jest.mock('./snapshot-stores', () => ({
  applySessionSnapshot: jest.fn(),
  applySubscriptionPlanChanged: jest.fn(),
  applyEntitlementsChanged: jest.fn(),
  applySubscriptionState: jest.fn(),
  useSnapshotStore: { getState: () => ({ tenantSubscription: null, tenantEntitlements: null }) },
}));

jest.mock('./events', () => ({ bridgeEvents: { _dispatch: jest.fn() } }));

jest.mock('@nebulr-group/bridge-auth-core', () => {
  class FakeRealtimeClient {
    setOnOpen() {}
    setOnClose() {}
    setOnSnapshot() {}
    setOnDegraded() {}
    setOnFlagChange() {}
    setOnStatusChange() {}
    setOnUserState(fn: (msg: Record<string, unknown>) => Promise<void>) {
      mockH.onUserState = fn;
    }
    setAppId() {}
    setWorkspaceId() {}
    setUserId() {}
    async reauthorize() {}
    async start() {}
    async stop() {}
  }
  return {
    RealtimeClient: FakeRealtimeClient,
    fetchBillingState: jest.fn(),
    useBridge: () => ({
      attachToRealtimeClient: () => {},
      entitlementsStore: { applyEntitlementsChanged: () => {} },
      subscription: { hydrate: () => {} },
      handle: (handlers: Record<string, (msg: unknown) => void>) => {
        mockH.billing = handlers;
        return () => {};
      },
    }),
  };
});

import { __resetBridgeRuntime, startBridgeRuntime, stopBridgeRuntime } from './bridge-runtime';
import { createRouteGuard } from '../auth/route-guard';
import * as mockedInstance from './bridge-instance';

mockH.store = mockedInstance.useBridgeStore as unknown as typeof mockH.store;

const enc = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const jwt = (claims: Record<string, unknown>) => `${enc({ alg: 'HS256' })}.${enc(claims)}.sig`;
const base = { sub: 'user-1', tid: 'ws-1', aid: 'app-1' };
const FREE = jwt({ ...base, plan: 'free', tv: 1 });
// Minted after the plan was saved but BEFORE the server bumped tokenVersion.
const PRO_PRE_BUMP = jwt({ ...base, plan: 'pro', tv: 1 });
const PRO = jwt({ ...base, plan: 'pro', tv: 2 });

const CONFIG = {
  rules: [
    { match: '/', public: true },
    { match: '/pro', featureFlag: 'pro-page', redirectTo: '/dashboard' },
  ],
  defaultAccess: 'protected' as const,
};
const guard = () => createRouteGuard(CONFIG as never);

const PLAN_CHANGED = {
  kind: 'subscription.plan_changed',
  tenantId: 'ws-1',
  from: { slug: 'free' },
  to: { slug: 'pro', name: 'Pro' },
  status: 'active',
  effectiveAt: '2026-09-15T10:00:00.000Z',
};
const ENTITLEMENTS_CHANGED = {
  kind: 'entitlements.changed',
  tenantId: 'ws-1',
  effectiveAt: '2026-09-15T10:00:00.000Z',
  entitlements: { pro_page: true },
};

const setToken = (accessToken: string | null) =>
  mockH.store.setState({ tokens: accessToken ? { accessToken } : null });
const currentToken = () => mockH.store.getState().tokens?.accessToken ?? null;

// The server mints `token`; it lands `ms` after the refresh starts.
function refreshLandsAfter(ms: number, token: string = PRO) {
  return () =>
    new Promise((resolve) => {
      setTimeout(() => {
        setToken(token);
        resolve({ accessToken: token });
      }, ms);
    });
}

// Settle-tracking wrapper: lets a test assert a decision has NOT been made yet.
function track<T>(p: Promise<T>) {
  const state: { done: boolean; value?: T } = { done: false };
  void p.then((value) => {
    state.done = true;
    state.value = value;
  });
  return state;
}

/** Run queued microtasks (and zero-delay timers) without moving the clock. */
async function drain(): Promise<void> {
  for (let i = 0; i < 10; i++) await jest.advanceTimersByTimeAsync(0);
}

function signedInOnFree(): void {
  setToken(FREE);
  startBridgeRuntime();
}

beforeEach(() => {
  jest.useFakeTimers();
  mockH.refreshCalls = 0;
  mockH.refreshImpl = refreshLandsAfter(300);
  mockH.evaluatedWith = [];
  mockH.checkDelayMs = 0;
  mockH.billing = undefined;
  mockH.onUserState = undefined;
  setToken(null);
});

afterEach(async () => {
  await stopBridgeRuntime();
  __resetBridgeRuntime();
  jest.useRealTimers();
});

describe('a plan change makes route decisions wait for the refreshed token (TBP-654)', () => {
  it('plan_changed, then an immediate navigation → the guard waits for the refresh and allows with the new token', async () => {
    signedInOnFree();
    mockH.billing!['subscription.plan_changed'](PLAN_CHANGED); // the page now says Pro
    const decision = track(guard().getNavigationDecision('/pro', '/pro')); // …and the user clicks

    await jest.advanceTimersByTimeAsync(299);
    expect(decision.done).toBe(false); // no verdict while the upgraded token is on its way
    expect(mockH.evaluatedWith).toEqual([]);

    await jest.advanceTimersByTimeAsync(1);
    await drain();
    expect(decision.done).toBe(true);
    expect(decision.value).toEqual({ type: 'allow' });
    expect(mockH.evaluatedWith).toEqual([PRO]);
    expect(mockH.refreshCalls).toBe(1);
  });

  it('the refresh starts on plan_changed itself — it does not wait for user.state_changed', () => {
    signedInOnFree();
    mockH.billing!['subscription.plan_changed'](PLAN_CHANGED);
    expect(mockH.refreshCalls).toBe(1);
  });

  it('entitlements.changed starts the refresh too', () => {
    signedInOnFree();
    mockH.billing!['entitlements.changed'](ENTITLEMENTS_CHANGED);
    expect(mockH.refreshCalls).toBe(1);
  });

  it('checkRouteRestrictions (ProtectedRoute-style reads) waits the same way', async () => {
    signedInOnFree();
    mockH.billing!['subscription.plan_changed'](PLAN_CHANGED);
    const check = track(guard().checkRouteRestrictions('/pro'));
    await jest.advanceTimersByTimeAsync(299);
    expect(check.done).toBe(false);
    await jest.advanceTimersByTimeAsync(1);
    await drain();
    expect(check.done).toBe(true);
    expect(check.value).toBeNull();
  });

  it('a decision already in flight when the plan changes re-reads with the new token', async () => {
    signedInOnFree();
    mockH.checkDelayMs = 100;
    const decision = track(guard().getNavigationDecision('/pro', '/pro')); // Free read in flight
    await jest.advanceTimersByTimeAsync(10);
    mockH.billing!['subscription.plan_changed'](PLAN_CHANGED);
    await jest.advanceTimersByTimeAsync(1_000);
    await drain();
    expect(decision.done).toBe(true);
    expect(decision.value).toEqual({ type: 'allow' });
    expect(mockH.evaluatedWith).toEqual([FREE, PRO]);
  });

  it('a refresh slower than the 3 s bound → decided at the bound with the token it has: fail closed', async () => {
    signedInOnFree();
    mockH.refreshImpl = refreshLandsAfter(10_000);
    mockH.billing!['subscription.plan_changed'](PLAN_CHANGED);
    const decision = track(guard().getNavigationDecision('/pro', '/pro'));

    await jest.advanceTimersByTimeAsync(2_999);
    expect(decision.done).toBe(false);
    await jest.advanceTimersByTimeAsync(1);
    await drain();
    expect(decision.done).toBe(true);
    expect(decision.value).toEqual({ type: 'redirect', to: '/dashboard' });
    expect(mockH.evaluatedWith).toEqual([FREE]);
  });

  it('a refresh that fails does not hang the guard or let the route through', async () => {
    signedInOnFree();
    mockH.refreshImpl = () => Promise.reject(new Error('refresh 500'));
    mockH.billing!['subscription.plan_changed'](PLAN_CHANGED);
    await expect(guard().getNavigationDecision('/pro', '/pro')).resolves.toEqual({
      type: 'redirect',
      to: '/dashboard',
    });
  });

  it('plan_changed + entitlements.changed + user.state_changed in quick succession → ONE refresh', async () => {
    signedInOnFree();
    mockH.billing!['subscription.plan_changed'](PLAN_CHANGED);
    await jest.advanceTimersByTimeAsync(40);
    mockH.billing!['entitlements.changed'](ENTITLEMENTS_CHANGED);
    await jest.advanceTimersByTimeAsync(40);
    // The joined refresh already carries the version this message announces.
    const userState = mockH.onUserState!({ kind: 'user.state_changed', reason: 'plan_changed', tokenVersion: 2 });
    expect(mockH.refreshCalls).toBe(1);

    await jest.advanceTimersByTimeAsync(300);
    await userState; // user.state_changed's handler waits for the refresh it joined
    await expect(guard().getNavigationDecision('/pro', '/pro')).resolves.toEqual({ type: 'allow' });
    // The new token re-runs the authorization change once, without refreshing again.
    expect(mockH.refreshCalls).toBe(1);
  });

  it('a navigation with no change pending decides at once — no wait, no refresh', async () => {
    signedInOnFree();
    await expect(guard().getNavigationDecision('/pro', '/pro')).resolves.toEqual({
      type: 'redirect',
      to: '/dashboard',
    });
    expect(mockH.refreshCalls).toBe(0);
  });
});

// The early refresh is minted after the plan is saved but can land BEFORE the
// server bumps tokenVersion (it bumps after publishing plan_changed). That
// token has the new plan but is TOKEN_VERSION_STALE for every version-checked
// endpoint — seen on stage as /billing/state 401 → "Subscription unavailable".
describe('a joined refresh that predates the announced token version is followed up once (TBP-654)', () => {
  function mintPreBumpThenCurrent(): void {
    let minted = 0;
    mockH.refreshImpl = () => {
      minted += 1;
      return refreshLandsAfter(300, minted === 1 ? PRO_PRE_BUMP : PRO)();
    };
  }

  it('user.state_changed announces tv 2 while the joined refresh mints tv 1 → one follow-up refresh to tv 2', async () => {
    signedInOnFree();
    mintPreBumpThenCurrent();
    mockH.billing!['subscription.plan_changed'](PLAN_CHANGED);
    await jest.advanceTimersByTimeAsync(40);
    const userState = mockH.onUserState!({ kind: 'user.state_changed', reason: 'plan_changed', tokenVersion: 2 });
    expect(mockH.refreshCalls).toBe(1); // joined, not duplicated

    await jest.advanceTimersByTimeAsync(300); // the pre-bump token lands
    await drain();
    expect(mockH.refreshCalls).toBe(2); // …and is behind tv 2 → one follow-up
    await jest.advanceTimersByTimeAsync(300);
    await userState;
    expect(currentToken()).toBe(PRO);
    expect(mockH.refreshCalls).toBe(2);
  });

  it('a navigation during the follow-up waits for it too, within the same bound', async () => {
    signedInOnFree();
    mintPreBumpThenCurrent();
    mockH.billing!['subscription.plan_changed'](PLAN_CHANGED);
    void mockH.onUserState!({ kind: 'user.state_changed', reason: 'plan_changed', tokenVersion: 2 });
    const decision = track(guard().getNavigationDecision('/pro', '/pro'));
    await jest.advanceTimersByTimeAsync(300);
    await drain();
    await jest.advanceTimersByTimeAsync(300);
    await drain();
    expect(decision.done).toBe(true);
    expect(decision.value).toEqual({ type: 'allow' });
    expect(mockH.evaluatedWith).toEqual([PRO]);
  });

  it('no version on the message (older server) → the single refresh stands', async () => {
    signedInOnFree();
    mockH.refreshImpl = refreshLandsAfter(300, PRO_PRE_BUMP);
    mockH.billing!['subscription.plan_changed'](PLAN_CHANGED);
    const userState = mockH.onUserState!({ kind: 'user.state_changed', reason: 'plan_changed' });
    await jest.advanceTimersByTimeAsync(300);
    await userState;
    expect(mockH.refreshCalls).toBe(1);
  });
});

describe('signed-out visitors are unaffected (TBP-654)', () => {
  it('no token → the events start no refresh and a protected route goes straight to login', async () => {
    startBridgeRuntime();
    mockH.billing!['subscription.plan_changed'](PLAN_CHANGED);
    await mockH.onUserState!({ kind: 'user.state_changed', reason: 'plan_changed', tokenVersion: 5 });
    expect(mockH.refreshCalls).toBe(0);
    // Resolves without any timer advancing: nothing to wait for.
    await expect(guard().getNavigationDecision('/pro', '/pro?x=1')).resolves.toEqual({
      type: 'login',
      loginUrl: 'https://hosted.example/login',
      returnTo: '/pro?x=1',
    });
    await expect(guard().getNavigationDecision('/', '/')).resolves.toEqual({ type: 'allow' });
  });
});
