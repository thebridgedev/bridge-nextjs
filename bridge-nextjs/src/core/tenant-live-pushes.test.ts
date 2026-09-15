/**
 * @jest-environment jsdom
 *
 * (jsdom because `startBridgeRuntime()` is browser-only and returns early
 * without a `window`.)
 *
 * TBP-644 — live billing pushes move `bridge.tenant.*` without a new snapshot.
 *
 * Regression: `subscription.plan_changed` and `entitlements.changed` were only
 * dispatched as events. The slices behind `bridge.tenant.subscription` and
 * `bridge.tenant.entitlements` were written by `session.snapshot` alone, and a
 * plan change never re-sends one, so an upgraded workspace kept rendering its
 * old plan until a reload (reproduced end to end on stage 2026-09-14 against
 * bridge-svelte, which shares this wiring). Port of bridge-svelte b7b0742.
 */
import { useBridge, type WebSocketLike } from '@nebulr-group/bridge-auth-core';
import { bridge, type BridgeReadable } from './bridge';
import { bridgeEvents, type BridgeEventHandlers } from './events';
import { __resetBridgeRuntime, startBridgeRuntime, stopBridgeRuntime } from './bridge-runtime';
import { _resetBridgeInstance, initBridge } from './bridge-instance';
import {
  __resetSnapshotStores,
  applyEntitlementsChanged,
  applySessionSnapshot,
  applySubscriptionPlanChanged,
  type SessionSnapshotData,
  type SubscriptionSnapshot,
} from './snapshot-stores';

// ── Fixtures ────────────────────────────────────────────────────────────────

const fullSnapshot: SessionSnapshotData = {
  app: { branding: { logo: 'https://cdn.test/logo.png', name: 'Acme App' } },
  tenant: {
    id: 'ws-1',
    name: 'Acme',
    subscription: { plan: { slug: 'free', name: 'Free' }, status: 'active' },
    entitlements: { app_active: true, ai_completions: true },
  },
  user: { id: 'user-1', email: 'a@acme.test', role: 'OWNER', tenantId: 'ws-1' },
};

const planChanged = (to: { slug: string; name: string }, status = 'active') => ({
  kind: 'subscription.plan_changed' as const,
  tenantId: 'ws-1',
  from: { slug: 'free' },
  to,
  status,
  effectiveAt: '2026-09-14T15:56:31.654Z',
});

function snapshotOnFree(extra: Partial<SubscriptionSnapshot> = {}): void {
  applySessionSnapshot({
    ...fullSnapshot,
    tenant: {
      ...fullSnapshot.tenant,
      subscription: { plan: { slug: 'free', name: 'Free' }, status: 'active', ...extra },
    },
  });
}

/** Current value of a bridge readable (subscribe runs synchronously with it). */
function read<T>(r: BridgeReadable<T>): T {
  let value!: T;
  r.subscribe((v) => {
    value = v;
  })();
  return value;
}

// ── The slice reducers ──────────────────────────────────────────────────────

describe('live pushes move bridge.tenant.* without a new snapshot (TBP-644)', () => {
  beforeEach(() => __resetSnapshotStores());

  it('subscription.plan_changed replaces plan + status on bridge.tenant.subscription', () => {
    snapshotOnFree();
    applySubscriptionPlanChanged(planChanged({ slug: 'pro', name: 'Pro' }));
    expect(read(bridge.tenant.subscription)).toEqual({ plan: { slug: 'pro', name: 'Pro' }, status: 'active' });
  });

  it('a subscriber sees free → pro live, with no further snapshot', () => {
    snapshotOnFree();
    const seen: Array<string | undefined> = [];
    const unsub = bridge.tenant.subscription.subscribe((s) => seen.push(s?.plan.slug));
    applySubscriptionPlanChanged(planChanged({ slug: 'pro', name: 'Pro' }));
    unsub();
    expect(seen).toEqual(['free', 'pro']);
  });

  it('keeps the fields the push does not carry (endsAt, gateEngaged)', () => {
    snapshotOnFree({ endsAt: '2026-10-01T00:00:00.000Z', gateEngaged: false });
    applySubscriptionPlanChanged(planChanged({ slug: 'pro', name: 'Pro' }));
    expect(read(bridge.tenant.subscription)).toEqual({
      plan: { slug: 'pro', name: 'Pro' },
      status: 'active',
      endsAt: '2026-10-01T00:00:00.000Z',
      gateEngaged: false,
    });
  });

  it('the pushed status wins over the snapshot status', () => {
    snapshotOnFree({ status: 'trialing' });
    applySubscriptionPlanChanged(planChanged({ slug: 'pro', name: 'Pro' }, 'active'));
    expect(read(bridge.tenant.subscription)?.status).toBe('active');
  });

  it('works when no snapshot ever landed (the push alone populates the slice)', () => {
    applySubscriptionPlanChanged(planChanged({ slug: 'pro', name: 'Pro' }));
    expect(read(bridge.tenant.subscription)).toEqual({ plan: { slug: 'pro', name: 'Pro' }, status: 'active' });
  });

  it('ignores a push without a plan slug and never throws', () => {
    snapshotOnFree();
    expect(() => applySubscriptionPlanChanged(undefined)).not.toThrow();
    expect(() => applySubscriptionPlanChanged({ to: null, status: 'active' })).not.toThrow();
    expect(() => applySubscriptionPlanChanged({ to: { slug: '' } })).not.toThrow();
    expect(read(bridge.tenant.subscription)?.plan.slug).toBe('free');
  });

  it('entitlements.changed with a map replaces the entitlements slice wholesale', () => {
    applySessionSnapshot(fullSnapshot);
    expect(bridge.tenant.entitlements.can('ai_completions')).toBe(true);
    applyEntitlementsChanged({ entitlements: { app_active: true, projects: true } });
    expect(read(bridge.tenant.entitlements.snapshot)).toEqual({ app_active: true, projects: true });
    expect(bridge.tenant.entitlements.can('ai_completions')).toBe(false);
    expect(bridge.tenant.entitlements.can('projects')).toBe(true);
  });

  it('the signal-only entitlements.changed (no map) leaves the slice untouched', () => {
    applySessionSnapshot(fullSnapshot);
    applyEntitlementsChanged({});
    applyEntitlementsChanged(undefined);
    expect(read(bridge.tenant.entitlements.snapshot)).toEqual(fullSnapshot.tenant.entitlements);
  });
});

// ── The runtime wiring ──────────────────────────────────────────────────────

/** A socket that never opens — the tests drive the billing handlers directly. */
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

describe('the runtime moves bridge.tenant.* before bridge.events sees the push (TBP-644)', () => {
  // The billing-family handler table the runtime registers via auth-core's
  // `useBridge().handle()` — auth-core calls these on every matching push.
  let billing: Record<string, (msg: unknown) => void>;
  const spies: Array<{ mockRestore(): void }> = [];
  const offs: Array<() => void> = [];
  const on = (handlers: BridgeEventHandlers) => offs.push(bridgeEvents.handle(handlers));

  beforeEach(() => {
    __resetBridgeRuntime();
    _resetBridgeInstance();
    __resetSnapshotStores();
    initBridge({ appId: 'app-1', apiBaseUrl: API } as never);
    const billingBridge = useBridge();
    spies.push(
      jest.spyOn(billingBridge, 'handle').mockImplementation(((h: Record<string, (msg: unknown) => void>) => {
        billing = h;
        return () => {};
      }) as never),
      // No live transport here: skip the push-hook wiring and the REST hydrate.
      jest.spyOn(billingBridge, 'attachToRealtimeClient').mockImplementation((() => {}) as never),
    );
    startBridgeRuntime({
      realtime: { websocketFactory: () => new InertWebSocket(), fetchFn, reportStatus: false, diagnose: false },
    });
  });

  afterEach(async () => {
    for (const off of offs.splice(0)) off();
    for (const spy of spies.splice(0)) spy.mockRestore();
    await stopBridgeRuntime();
    __resetBridgeRuntime();
  });

  it('subscription.plan_changed: a bridge.events handler already reads the new plan', () => {
    snapshotOnFree();
    const seenAtDispatch: Array<SubscriptionSnapshot | null> = [];
    on({ 'subscription.plan_changed': () => seenAtDispatch.push(read(bridge.tenant.subscription)) });

    billing['subscription.plan_changed'](planChanged({ slug: 'pro', name: 'Pro' }));

    expect(seenAtDispatch).toEqual([{ plan: { slug: 'pro', name: 'Pro' }, status: 'active' }]);
    expect(read(bridge.tenant.subscription)?.plan.slug).toBe('pro');
  });

  it('entitlements.changed with a map: a bridge.events handler already reads the new map', () => {
    applySessionSnapshot(fullSnapshot);
    const canAtDispatch: boolean[] = [];
    on({ 'entitlements.changed': () => canAtDispatch.push(bridge.tenant.entitlements.can('projects')) });

    billing['entitlements.changed']({
      kind: 'entitlements.changed',
      tenantId: 'ws-1',
      effectiveAt: '2026-09-14T15:56:31.605Z',
      entitlements: { app_active: true, projects: true },
    });

    expect(canAtDispatch).toEqual([true]);
    expect(read(bridge.tenant.entitlements.snapshot)).toEqual({ app_active: true, projects: true });
  });

  it('the signal-only entitlements.changed is dispatched and leaves the slice alone', () => {
    applySessionSnapshot(fullSnapshot);
    const received: unknown[] = [];
    on({ 'entitlements.changed': (m) => received.push(m) });
    const msg = { kind: 'entitlements.changed', tenantId: 'ws-1', effectiveAt: '2026-09-14T15:56:31.605Z' };

    billing['entitlements.changed'](msg);

    expect(received).toEqual([msg]);
    expect(read(bridge.tenant.entitlements.snapshot)).toEqual(fullSnapshot.tenant.entitlements);
  });

  it('lifecycle events are dispatched but not mirrored into bridge.tenant.subscription', () => {
    snapshotOnFree();
    const received: unknown[] = [];
    on({ 'subscription.canceled': (m) => received.push(m) });
    const msg = { kind: 'subscription.canceled', tenantId: 'ws-1', occurredAt: '2026-09-14T16:00:00.000Z' };

    billing['subscription.canceled'](msg);

    expect(received).toEqual([msg]);
    expect(read(bridge.tenant.subscription)).toEqual({ plan: { slug: 'free', name: 'Free' }, status: 'active' });
  });

  it('a push the slice update chokes on still reaches bridge.events handlers', () => {
    snapshotOnFree();
    const received: unknown[] = [];
    on({ 'subscription.plan_changed': (m) => received.push(m) });
    const hostile = {
      kind: 'subscription.plan_changed',
      get to(): never {
        throw new Error('boom');
      },
    };

    expect(() => billing['subscription.plan_changed'](hostile)).not.toThrow();
    expect(received).toEqual([hostile]);
    expect(read(bridge.tenant.subscription)?.plan.slug).toBe('free');
  });
});
