/**
 * Live Channel Unification (TBP-326) — Playwright spec for the unified `bridge`
 * read surface. Ported from bridge-svelte; the demo exposes the same
 * Svelte-store-compatible `window.bridge` (BridgeWindowExpose), so the
 * assertions are identical.
 *
 * Verifies the end-to-end snapshot flow:
 *   1. After authenticated bootstrap completes, `bridge.tenant.id` resolves
 *      to a non-null workspaceId.
 *   2. `bridge.user` resolves to the logged-in user of that workspace.
 *   3. `bridge.tenant.subscription.plan.slug` exposes the current plan.
 *   4. `bridge.tenant.entitlements.can(...)` answers from the snapshot map.
 *   5. `bridge.app.plans` is lazy (null) before .load(); resolves after.
 *
 * Every assertion here reads a slice of the AUTHENTICATED session snapshot —
 * `bridge.tenant`, `bridge.user`, the entitlement map, and `bridge.app.plans`
 * (whose `load()` calls `BridgeAuth.getPlans`, which throws `Not authenticated`
 * without a session). So each test takes `authenticatedPage`, not `page`.
 *
 * TBP-721: this copy was still on the plain `page` fixture — on stage the
 * plans test died with `Not authenticated` and the other two could only ever
 * see an anonymous surface (bridge-svelte fixed the same in TBP-607). The
 * entitlements test also returned an always-truthy object from
 * `waitForFunction`, so it resolved before the snapshot and asserted the
 * pre-snapshot `false`; it now gates on `entitlements.snapshot` like
 * bridge-svelte's (TBP-686).
 *
 * Tests 1 and 2 are the regression coverage for TBP-686: `session.snapshot` is
 * published during authorize, before the subscription is live, so on a FIRST
 * connect it can be lost, and the `/session/init` catch-up only ran on
 * reconnects. They are deliberately not weakened.
 */

import { test, expect } from '../../fixtures/auth';
import { MED_TIMEOUT } from '../../fixtures/timeouts';

test.describe('Unified bridge surface — session.snapshot end-to-end', () => {
  test('snapshot lands and populates bridge.tenant + bridge.user', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/');

    // The demo exposes `window.bridge` for e2e access (see BridgeWindowExpose).
    const result = await page.waitForFunction(
      () => {
        const w = window as unknown as {
          bridge?: {
            tenant: {
              id: { subscribe: (fn: (v: string | null) => void) => () => void };
              subscription: { subscribe: (fn: (v: unknown) => void) => () => void };
            };
            user: { subscribe: (fn: (v: unknown) => void) => () => void };
          };
        };
        if (!w.bridge) return null;
        let tenantId: string | null = null;
        let subscription: any = null;
        let user: any = null;
        const u1 = w.bridge.tenant.id.subscribe((v) => { tenantId = v; });
        const u2 = w.bridge.tenant.subscription.subscribe((v) => { subscription = v; });
        const u3 = w.bridge.user.subscribe((v) => { user = v; });
        u1(); u2(); u3();
        return tenantId && subscription && user ? { tenantId, subscription, user } : null;
      },
      { timeout: MED_TIMEOUT },
    );

    const value = await result.jsonValue();
    expect(value).not.toBeNull();
    expect(value.tenantId).toMatch(/.+/);
    expect(value.subscription.plan).toBeDefined();
    expect(value.subscription.plan.slug).toMatch(/.+/);
    expect(value.user.id).toMatch(/.+/);
    expect(value.user.tenantId).toBe(value.tenantId);
  });

  test('entitlements.can() answers from the snapshot map', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/');

    // Gate on the entitlement MAP arriving, not merely on `window.bridge`
    // existing.
    //
    // This used to return `{ app_active: can('app_active') }` unconditionally.
    // That object is always truthy, so `waitForFunction` resolved on its very
    // first tick — the moment `window.bridge` was defined, long before the
    // session snapshot lands — and asserted the pre-snapshot `false`. It
    // reported a product defect that a live probe disproved on bridge-svelte:
    // `can('app_active')` is true from the first moment the map exists
    // (TBP-686).
    //
    // `entitlements.snapshot` is null until the snapshot arrives, so it is the
    // honest gate: null means "not loaded", a map means we have a real answer.
    // The snapshot test above already gates on its slices being non-null.
    const canApp = await page.waitForFunction(
      () => {
        const w = window as unknown as {
          bridge?: {
            tenant: {
              entitlements: {
                can: (k: string) => boolean;
                snapshot: { subscribe: (cb: (v: unknown) => void) => () => void };
              };
            };
          };
        };
        if (!w.bridge) return null;
        let map: unknown = null;
        const unsub = w.bridge.tenant.entitlements.snapshot.subscribe((v) => { map = v; });
        unsub();
        if (!map) return null;
        // app_active is the canonical "is the workspace allowed in" entitlement;
        // every active workspace should report true.
        return { app_active: w.bridge.tenant.entitlements.can('app_active') };
      },
      { timeout: MED_TIMEOUT },
    );
    const value = await canApp.jsonValue();
    expect(value).toEqual({ app_active: true });
  });

  test('bridge.app.plans is lazy — null until .load(), populated after', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/');

    // What the first evaluate needs is `window.bridge`, so wait for that — the
    // same probe the other tests in this file use. Waiting for the network to go
    // idle would never return: the SDK holds a realtime WebSocket (TBP-721).
    await page.waitForFunction(
      () => !!(window as unknown as { bridge?: unknown }).bridge,
      undefined,
      { timeout: MED_TIMEOUT },
    );

    // Initially null.
    const initial = await page.evaluate(() => {
      const w = window as unknown as { bridge?: { app: { plans: { _peek: () => unknown; isLoaded: boolean } } } };
      return w.bridge ? { value: w.bridge.app.plans._peek(), isLoaded: w.bridge.app.plans.isLoaded } : null;
    });
    expect(initial?.isLoaded).toBe(false);
    expect(initial?.value).toBeNull();

    // After .load(), value populated.
    const loaded = await page.evaluate(async () => {
      const w = window as unknown as { bridge?: { app: { plans: { load: () => Promise<unknown[]>; isLoaded: boolean } } } };
      if (!w.bridge) return null;
      const v = await w.bridge.app.plans.load();
      return { len: Array.isArray(v) ? v.length : -1, isLoaded: w.bridge.app.plans.isLoaded };
    });
    expect(loaded?.isLoaded).toBe(true);
    expect(loaded?.len).toBeGreaterThan(0);
  });
});
