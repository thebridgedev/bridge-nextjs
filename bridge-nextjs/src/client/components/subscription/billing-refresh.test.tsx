/**
 * @jest-environment jsdom
 *
 * TBP-948 (port of bridge-svelte TBP-762) — the billing screens stay current.
 *
 * In bridge-nextjs 0.9.0 each screen read the plan list and the billing state
 * once, on mount, and only when the store was empty, so a plan created,
 * changed or removed in Bridge did not appear until a reload. Svelte re-reads
 * on one rule: a renewed sign-in, a live billing event, and the tab regaining
 * focus when the last read is older than 30 seconds.
 *
 * Revert-proof: on origin/main no trigger below re-reads anything (there is no
 * focus handler, and neither a new token nor a billing push touches the plan
 * list), so "Team" never appears.
 */
import * as React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { useBridge as useBillingBridge } from '@nebulr-group/bridge-auth-core';

jest.mock(
  'next/navigation',
  () => ({
    useParams: () => ({}),
    usePathname: () => '/subscription',
    useRouter: () => ({ push: jest.fn(), replace: jest.fn(), refresh: jest.fn() }),
    useSearchParams: () => new URLSearchParams(),
  }),
  { virtual: true },
);

/* eslint-disable @typescript-eslint/no-var-requires */
const { PlanSelector } = require('./PlanSelector');
const { BridgeSubscriptionStatus } = require('./BridgeSubscriptionStatus');
const { BridgeProvider } = require('../../providers/bridge-provider');
const instance = require('../../../core/bridge-instance');
const { __resetBridgeRuntime } = require('../../../core/bridge-runtime');
const { __resetSnapshotStores } = require('../../../core/snapshot-stores');
const { setBridgeFlagsInstance } = require('../../../flags/registry');
const optional = (path: string): Record<string, (...a: unknown[]) => void> => {
  try {
    return require(path);
  } catch {
    return {};
  }
};
/** Absent before TBP-948; the tests still run (and fail on behaviour) without them. */
const billingStore = optional('../../../core/billing-store');
const startupReads = optional('../../../core/startup-reads');
/* eslint-enable @typescript-eslint/no-var-requires */

const act = (React as unknown as { act: (cb: () => Promise<void> | void) => Promise<void> }).act;
const g = globalThis as unknown as Record<string, unknown>;

const API = 'http://api.test.local';
const APP = 'tbp-948-billing';

function jwt(claims: Record<string, unknown>): string {
  const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, '');
  return `${b64({ alg: 'none' })}.${b64(claims)}.sig`;
}
const tokensFor = (tid: string, extra: Record<string, unknown> = {}) => ({
  accessToken: jwt({ sub: 'user-1', tid, aid: APP, exp: Math.floor(Date.now() / 1000) + 3600, ...extra }),
  refreshToken: 'r',
  idToken: 'i',
});

const price = (id: string, amount: number) => ({ id, amount, currency: 'usd', recurrenceInterval: 'month' });
const FREE = { key: 'free', name: 'Free', prices: [price('f', 0)] };
const PRO = { key: 'pro', name: 'Pro', prices: [price('p', 29)] };
const TEAM = { key: 'team', name: 'Team', prices: [price('t', 99)] };

class FakeWebSocket {
  readyState = 0;
  constructor(public readonly url: string) {}
  send(): void {}
  close(): void {}
  addEventListener(): void {}
  removeEventListener(): void {}
}

function response(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: '',
    headers: { get: (k: string) => (k.toLowerCase() === 'content-type' ? 'application/json' : null) },
    json: async () => body,
    text: async () => (body === undefined ? '' : JSON.stringify(body)),
    clone() {
      return this;
    },
  };
}

/** What Bridge currently has: the app's plans and the workspace's plan. */
let plans: unknown[] = [];
let billingState: { plan: { slug: string; name: string }; status: string } = { plan: { slug: 'pro', name: 'Pro' }, status: 'active' };
let requests: string[] = [];
let container: HTMLElement;
let root: Root | null = null;
let handlers: Record<string, (msg: unknown) => void> = {};
const spies: Array<{ mockRestore(): void }> = [];
const originalVersions = process.versions;
const real = { warn: console.warn, error: console.error, info: console.info, log: console.log };

beforeAll(() => {
  g.IS_REACT_ACT_ENVIRONMENT = true;
  g.WebSocket = FakeWebSocket;
  console.warn = () => {};
  console.info = () => {};
  console.error = () => {};
  console.log = () => {};
});
afterAll(() => {
  Object.assign(console, real);
});

function resetAll(): void {
  setBridgeFlagsInstance(undefined);
  __resetBridgeRuntime();
  instance._resetBridgeInstance();
  __resetSnapshotStores();
  billingStore.__resetBillingStoreForTests?.();
  startupReads.__resetStartupReadsForTests?.();
  const sub = useBillingBridge().subscription as unknown as { _state: unknown; _loading: boolean; _error: unknown };
  sub._state = null;
  sub._loading = false;
  sub._error = null;
}

beforeEach(() => {
  Object.defineProperty(process, 'versions', { configurable: true, value: { ...originalVersions, node: undefined } });
  plans = [FREE, PRO];
  billingState = { plan: { slug: 'pro', name: 'Pro' }, status: 'active' };
  requests = [];
  handlers = {};
  g.fetch = async (input: unknown) => {
    const url = String(input);
    const path = url.startsWith(API) ? url.slice(API.length).split('?')[0] : url;
    requests.push(path);
    if (path === '/account/subscription/plans') return response(200, plans);
    if (path === '/account/subscription/status') return response(200, { plan: { key: 'pro', name: 'Pro' }, paymentsEnabled: true });
    if (path === '/billing/state') return response(200, billingState);
    if (path === '/entitlements') return response(200, { entitlements: {} });
    return response(404, {});
  };
  resetAll();
  instance.__setBillingRetryDelay?.(10);
  // Capture the live billing handlers the runtime registers.
  const billing = useBillingBridge();
  spies.push(
    jest.spyOn(billing, 'handle').mockImplementation(((h: Record<string, (msg: unknown) => void>) => {
      handlers = { ...handlers, ...h };
      return () => {};
    }) as never),
  );
});

afterEach(async () => {
  const current = root;
  root = null;
  if (current) await act(async () => current.unmount());
  container?.remove();
  for (const s of spies.splice(0)) s.mockRestore();
  jest.restoreAllMocks();
  localStorage.removeItem(`bridge_tokens:${APP}`);
  Object.defineProperty(process, 'versions', { configurable: true, value: originalVersions });
  resetAll();
  instance.__setBillingRetryDelay?.(1000);
});

/** Poll `check` every 20 ms. Counts rounds, not `Date.now()`, which some tests move. */
async function until(check: () => boolean, timeoutMs = 2000): Promise<boolean> {
  for (let waited = 0; waited < timeoutMs; waited += 20) {
    if (check()) return true;
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
  }
  return check();
}

const planNames = () => [...container.querySelectorAll('.bridge-plan-name')].map((n) => n.textContent);
const statusText = () => container.querySelector('.bridge-subscription-status')?.textContent ?? '';
const count = (path: string) => requests.filter((p) => p === path).length;

async function renderBilling(): Promise<void> {
  localStorage.setItem(`bridge_tokens:${APP}`, JSON.stringify(tokensFor('ws-1')));
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <BridgeProvider appId={APP} config={{ apiBaseUrl: API, devBadge: false, billing: { paywallRoute: false } }}>
        <BridgeSubscriptionStatus />
        <PlanSelector />
      </BridgeProvider>,
    );
  });
  expect(await until(() => planNames().length === 2 && statusText().includes('Pro'))).toBe(true);
}

/** Pretend `ms` have passed since now. */
function later(ms: number): void {
  const now = Date.now();
  jest.spyOn(Date, 'now').mockReturnValue(now + ms);
}

describe('TBP-948 — billing screens refresh without a reload', () => {
  it('a plan added in Bridge appears when the tab regains focus after 30 s', async () => {
    await renderBilling();
    plans = [FREE, PRO, TEAM];

    // Within 30 s of the last read: focus re-reads nothing.
    const before = count('/account/subscription/plans');
    await act(async () => void window.dispatchEvent(new Event('focus')));
    await until(() => false, 100);
    expect(count('/account/subscription/plans')).toBe(before);
    expect(planNames()).not.toContain('Team');

    later(31_000);
    await act(async () => void window.dispatchEvent(new Event('focus')));
    expect(await until(() => planNames().includes('Team'))).toBe(true);
  });

  it('the status badge follows a plan changed in Bridge when the tab comes back into view', async () => {
    await renderBilling();
    billingState = { plan: { slug: 'team', name: 'Team' }, status: 'active' };
    later(31_000);
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    await act(async () => void document.dispatchEvent(new Event('visibilitychange')));
    expect(await until(() => statusText().includes('Team'))).toBe(true);
  });

  it('a renewed sign-in re-reads the plan list and the billing state', async () => {
    await renderBilling();
    plans = [FREE, PRO, TEAM];
    billingState = { plan: { slug: 'team', name: 'Team' }, status: 'active' };
    // What a token refresh does: store and announce the new tokens.
    const fresh = tokensFor('ws-1', { iat: Date.now() + 1 });
    await act(async () => {
      (instance.getBridgeAuth() as unknown as { tokenManager: { tokens: unknown } }).tokenManager.tokens = fresh;
      instance.useBridgeStore.setState({ tokens: fresh });
    });
    expect(await until(() => planNames().includes('Team') && statusText().includes('Team'))).toBe(true);
  });

  it('a live billing event re-reads the plan list and the billing state', async () => {
    await renderBilling();
    plans = [FREE, PRO, TEAM];
    billingState = { plan: { slug: 'team', name: 'Team' }, status: 'active' };
    expect(typeof handlers['subscription.updated']).toBe('function');
    await act(async () => handlers['subscription.updated']({ kind: 'subscription.updated', tenantId: 'ws-1' }));
    expect(await until(() => planNames().includes('Team') && statusText().includes('Team'))).toBe(true);
  });

  it('a background re-read that fails keeps the plans on screen', async () => {
    await renderBilling();
    g.fetch = async () => response(500, { message: 'down' });
    later(31_000);
    await act(async () => void window.dispatchEvent(new Event('focus')));
    await until(() => false, 200);
    expect(planNames()).toEqual(['Free', 'Pro']);
    expect(container.querySelector('[data-bridge-plan-empty]')).toBeNull();
  });
});

describe('TBP-948 — the subscription badge never flashes "No subscription"', () => {
  it('its first paint, before any read has answered, says "Loading…"', () => {
    // The server render and the client's first render (before the effect that
    // reads): nothing is in the store yet.
    const html = renderToStaticMarkup(<BridgeSubscriptionStatus />);
    expect(html).toContain('Loading…');
    expect(html).not.toContain('No subscription');
  });

  it('then shows the plan once its read has answered', async () => {
    await renderBilling();
    expect(statusText()).toContain('Pro');
  });
});
