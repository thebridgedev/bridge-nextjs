/**
 * @jest-environment jsdom
 *
 * TBP-948 (port of bridge-svelte TBP-810 / bridge-react TBP-941) — a page that
 * loads signed in shows the features the workspace's plan includes, unlocked,
 * with no "Upgrade to use this" flash; and the gates follow the plan when it
 * changes.
 *
 * In bridge-nextjs 0.9.0 nothing configured auth-core's entitlements store or
 * read it before the page rendered. It is fail-closed, so a `<FeatureFlag
 * upgrade>` ruled on `bridge:billing.entitlement.*` showed "Upgrade to use
 * this" to a paying workspace on every reload, until the realtime catch-up
 * filled the store. And flags re-evaluated only on a token or flag-definition
 * change, never when the plan's features, the subscription or a quota moved.
 *
 * Revert-proof: on origin/main the reload case shows the upgrade button before
 * the feature unlocks, the store push case never unlocks, and the server render
 * shows the fallback.
 */
import * as React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { useBridge as useBillingBridge } from '@nebulr-group/bridge-auth-core';

jest.mock(
  'next/navigation',
  () => ({
    useParams: () => ({}),
    usePathname: () => '/',
    useRouter: () => ({ push: jest.fn(), replace: jest.fn(), refresh: jest.fn() }),
    useSearchParams: () => new URLSearchParams(),
  }),
  { virtual: true },
);

/* eslint-disable @typescript-eslint/no-var-requires */
const { FeatureFlag } = require('./FeatureFlag');
const { setBridgeFlagsInstance } = require('../../flags/registry');
const { BridgeProvider } = require('../providers/bridge-provider');
const { _resetBridgeInstance, getBridgeAuth, useBridgeStore } = require('../../core/bridge-instance');
const { __resetBridgeRuntime } = require('../../core/bridge-runtime');
const { __resetSnapshotStores } = require('../../core/snapshot-stores');
/** Absent before TBP-948; the tests still run (and fail on behaviour) without it. */
const startupReads: { __resetStartupReadsForTests?: () => void } = (() => {
  try {
    return require('../../core/startup-reads');
  } catch {
    return {};
  }
})();
/* eslint-enable @typescript-eslint/no-var-requires */

const act = (React as unknown as { act: (cb: () => Promise<void> | void) => Promise<void> }).act;
const g = globalThis as unknown as Record<string, unknown>;

const API = 'http://api.test.local';
const APP = 'tbp-948';

function jwt(claims: Record<string, unknown>): string {
  const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, '');
  return `${b64({ alg: 'none' })}.${b64(claims)}.sig`;
}
const exp = () => Math.floor(Date.now() / 1000) + 3600;
const tokensFor = (tid: string) => ({
  accessToken: jwt({ sub: 'user-1', tid, aid: APP, exp: exp() }),
  refreshToken: 'r',
  idToken: 'i',
});

/** The flag QR Studio gates Colors on: `bridge:billing.entitlement.custom_colors eq true`. */
const FLAGS = [
  {
    key: 'custom-colors',
    state: 'on-with-rule',
    valueType: 'boolean',
    onValue: true,
    offValue: false,
    rule: {
      branches: [
        {
          conditions: [{ attribute: 'bridge:billing.entitlement.custom_colors', operator: 'eq', values: [true] }],
          returnValue: true,
        },
      ],
      otherwiseValue: false,
      rolloutPct: 100,
    },
  },
];

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
    text: async () => JSON.stringify(body),
    clone() {
      return this;
    },
  };
}

function workspaceOf(auth: string | null | undefined): string {
  const part = auth?.replace('Bearer ', '').split('.')[1] ?? '';
  try {
    return (JSON.parse(atob(part)) as { tid: string }).tid;
  } catch {
    return '';
  }
}

/** What `GET /entitlements` answers, per workspace. */
let entitlements: Record<string, Record<string, boolean>> = {};
let requests: string[] = [];
/** Delay before `GET /entitlements` answers, so a test can see what renders meanwhile. */
let entitlementsDelayMs = 0;
let container: HTMLElement;
let root: Root | null = null;
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
  _resetBridgeInstance();
  __resetSnapshotStores();
  startupReads.__resetStartupReadsForTests?.();
  useBillingBridge().entitlementsStore.__resetForTests();
}

beforeEach(() => {
  // Keep auth-core's durable usage queue in memory, not in ~/.bridge.
  Object.defineProperty(process, 'versions', { configurable: true, value: { ...originalVersions, node: undefined } });
  entitlements = { 'ws-pro': { custom_colors: true }, 'ws-free': { custom_colors: false } };
  requests = [];
  entitlementsDelayMs = 0;
  g.fetch = async (input: unknown, init?: { headers?: Record<string, string> }) => {
    const url = String(input);
    const path = url.startsWith(API) ? url.slice(API.length).split('?')[0] : url;
    requests.push(path);
    if (path === '/entitlements') {
      if (entitlementsDelayMs) await new Promise((r) => setTimeout(r, entitlementsDelayMs));
      const ws = workspaceOf(new Headers(init?.headers).get('Authorization'));
      return response(200, { entitlements: entitlements[ws] ?? {} });
    }
    if (path === `/admin/flags-internal/flags-cache/${APP}`) return response(200, FLAGS);
    if (path === '/auth/token') {
      // The page's background refresh: a new token for the same session.
      const current = (getBridgeAuth().getApiContext().accessToken ?? '').split('.')[1] ?? '';
      const claims = JSON.parse(atob(current)) as Record<string, unknown>;
      return response(201, { access_token: jwt({ ...claims, iat: Date.now() }), refresh_token: 'r2', id_token: 'i' });
    }
    return response(404, {});
  };
  resetAll();
});

afterEach(async () => {
  const current = root;
  root = null;
  if (current) await act(async () => current.unmount());
  container?.remove();
  localStorage.removeItem(`bridge_tokens:${APP}`);
  Object.defineProperty(process, 'versions', { configurable: true, value: originalVersions });
  resetAll();
});

/** What auth-core does on a sign-in or workspace switch: store the tokens, then announce them. */
function signIn(tokens: ReturnType<typeof tokensFor>): void {
  (getBridgeAuth() as unknown as { tokenManager: { tokens: unknown } }).tokenManager.tokens = tokens;
  useBridgeStore.setState({ tokens });
}

async function until(check: () => boolean, timeoutMs = 3000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (check()) return true;
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
  }
  return check();
}

/** Render the app and record whether "Upgrade to use this" is EVER on screen. */
async function renderStudio() {
  container = document.createElement('div');
  document.body.appendChild(container);
  let lockedSeen = false;
  const observer = new MutationObserver(() => {
    if (container.querySelector('[data-bridge-feature-upgrade]')) lockedSeen = true;
  });
  observer.observe(container, { childList: true, subtree: true });
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <React.StrictMode>
        <BridgeProvider appId={APP} config={{ apiBaseUrl: API, devBadge: false, billing: { paywallRoute: false } }}>
          <FeatureFlag flagKey="custom-colors" defaultValue={false} upgrade loading={<i data-testid="waiting" />}>
            <span data-testid="colors">Colors</span>
          </FeatureFlag>
        </BridgeProvider>
      </React.StrictMode>,
    );
  });
  if (container.querySelector('[data-bridge-feature-upgrade]')) lockedSeen = true;
  return {
    unlocked: () => !!container.querySelector('[data-testid="colors"]'),
    locked: () => !!container.querySelector('[data-bridge-feature-upgrade]'),
    waiting: () => !!container.querySelector('[data-testid="waiting"]'),
    lockedSeen: () => lockedSeen,
    resetLockedSeen: () => {
      lockedSeen = false;
    },
    stop: () => observer.disconnect(),
  };
}

describe('TBP-948 — plan-gated features on a reload and after a sign-in', () => {
  it('a reload of a workspace whose plan includes the feature renders it unlocked, with no locked flash', async () => {
    localStorage.setItem(`bridge_tokens:${APP}`, JSON.stringify(tokensFor('ws-pro')));
    entitlementsDelayMs = 150; // the read takes a moment, as on a real network
    const view = await renderStudio();
    expect(await until(view.unlocked)).toBe(true);
    // Give any late re-evaluation a chance to lock it again.
    await until(() => false, 300);
    expect(view.unlocked()).toBe(true);
    expect(view.lockedSeen()).toBe(false);
    expect(requests).toContain('/entitlements');
    expect(useBillingBridge().entitlementsStore.can('custom_colors')).toBe(true);
    view.stop();
  });

  it('while the plan is being read the gate shows its `loading` slot, not the fallback', async () => {
    localStorage.setItem(`bridge_tokens:${APP}`, JSON.stringify(tokensFor('ws-pro')));
    entitlementsDelayMs = 400;
    const view = await renderStudio();
    await until(() => false, 100);
    expect(view.waiting()).toBe(true);
    expect(view.locked()).toBe(false);
    expect(await until(view.unlocked)).toBe(true);
    expect(view.waiting()).toBe(false);
    view.stop();
  });

  it('a workspace whose plan does not include it still sees it locked', async () => {
    localStorage.setItem(`bridge_tokens:${APP}`, JSON.stringify(tokensFor('ws-free')));
    const view = await renderStudio();
    expect(await until(view.locked)).toBe(true);
    expect(view.unlocked()).toBe(false);
    view.stop();
  });

  it('a slow plan read never holds the gate longer than the cap', async () => {
    localStorage.setItem(`bridge_tokens:${APP}`, JSON.stringify(tokensFor('ws-free')));
    entitlementsDelayMs = 10_000;
    const view = await renderStudio();
    // Each startup read is capped at 1.5 s; the gate then decides on what it has.
    expect(await until(view.locked, 2500)).toBe(true);
    view.stop();
  }, 10_000);

  it('signing in after the page loaded reads the plan and unlocks the feature without a reload or a locked flash', async () => {
    const view = await renderStudio();
    expect(await until(() => requests.includes(`/admin/flags-internal/flags-cache/${APP}`))).toBe(true);
    expect(requests).not.toContain('/entitlements'); // signed out: nothing to read

    view.resetLockedSeen();
    entitlementsDelayMs = 150;
    await act(async () => signIn(tokensFor('ws-pro')));
    expect(await until(view.unlocked)).toBe(true);
    expect(requests).toContain('/entitlements');
    expect(view.lockedSeen()).toBe(false);
    view.stop();
  });

  it("switching workspace reads the new workspace's plan", async () => {
    localStorage.setItem(`bridge_tokens:${APP}`, JSON.stringify(tokensFor('ws-pro')));
    const view = await renderStudio();
    expect(await until(view.unlocked)).toBe(true);

    await act(async () => signIn(tokensFor('ws-free')));
    expect(await until(view.locked)).toBe(true);
    expect(requests.filter((p) => p === '/entitlements').length).toBeGreaterThanOrEqual(2);
    view.stop();
  });

  it('a change to the plan’s features re-evaluates a mounted gate (an upgrade unlocks it in place)', async () => {
    localStorage.setItem(`bridge_tokens:${APP}`, JSON.stringify(tokensFor('ws-free')));
    const view = await renderStudio();
    expect(await until(view.locked)).toBe(true);

    // What a checkout's `entitlements.changed` push (or the catch-up) writes.
    await act(async () => useBillingBridge().entitlementsStore.applyEntitlementsChanged({ custom_colors: true }));
    expect(await until(view.unlocked, 1000)).toBe(true);
    view.stop();
  });
});

describe('TBP-948 — the server render', () => {
  it('renders the `loading` slot: the server cannot know the session, and hydration must match', () => {
    const html = renderToStaticMarkup(
      <FeatureFlag flagKey="custom-colors" defaultValue={false} upgrade fallback={<b>Upgrade</b>} loading={<i>…</i>}>
        <span>Colors</span>
      </FeatureFlag>,
    );
    expect(html).toBe('<i>…</i>');
  });
});
