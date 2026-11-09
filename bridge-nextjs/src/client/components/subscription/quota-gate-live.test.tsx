/**
 * @jest-environment jsdom
 *
 * TBP-942 — a report that reaches a hard limit closes `<QuotaGate>` straight
 * away, without a reload, on a page that is busy re-rendering.
 *
 * Seen in the 9 Nov test runs (bridge-nextjs 0.8.1): a Free workspace with a
 * limit of 1 could create a 2nd code; the gate closed only after a reload. The
 * page's own `bridge.usage.report('qr_codes')` shares auth-core's usage queue
 * with the SDK's `bridge.flag_evaluations` count, which was reported once per
 * flag on every render (several times per render under StrictMode). The queue
 * sends 10 events a second, oldest first, so a typing user queued hundreds of
 * evaluations ahead of the app's report: every ingest in the run's network log
 * went out in batches of exactly 10. SvelteKit's did not.
 *
 * Revert-proof: on origin/main the keystrokes below queue ~300 evaluation
 * events ahead of the report, and the gate is still open after 3 s.
 */
import * as React from 'react';
import { createRoot, type Root } from 'react-dom/client';
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
const { QuotaGate } = require('./QuotaGate');
const { FeatureFlag } = require('../FeatureFlag');
const { useFlag } = require('../../../flags/use-flag');
const { setBridgeFlagsInstance } = require('../../../flags/registry');
const { coalesceUsageReports } = require('../../../flags/evaluation-count');
const { bridge } = require('../../../core/bridge');
const { BridgeProvider } = require('../../providers/bridge-provider');
const { _resetBridgeInstance } = require('../../../core/bridge-instance');
const { __resetBridgeRuntime } = require('../../../core/bridge-runtime');
/* eslint-enable @typescript-eslint/no-var-requires */

const act = (React as unknown as { act: (cb: () => Promise<void> | void) => Promise<void> }).act;
const g = globalThis as unknown as Record<string, unknown>;

const API = 'http://api.test.local';
const APP = 'tbp-942';

function jwt(claims: Record<string, unknown>): string {
  const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, '');
  return `${b64({ alg: 'none' })}.${b64(claims)}.sig`;
}
const sessionToken = () =>
  jwt({ sub: 'user-1', tid: 'ws-1', aid: APP, exp: Math.floor(Date.now() / 1000) + 3600, iat: Date.now() });

const FLAGS = ['custom-colors', 'custom-logo', 'download-svg'].map((key) => ({
  key,
  state: 'on',
  valueType: 'boolean',
  onValue: true,
  offValue: false,
}));

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

/** What Bridge has counted for `qr_codes` this period. */
let used = 0;
/** Every `POST /usage/ingest` body, in order. */
let ingested: Array<{ metric: string; value: number }> = [];
let container: HTMLElement;
let root: Root | null = null;
const realWarn = console.warn;
const realError = console.error;
const realInfo = console.info;
const realLog = console.log;
// auth-core's usage queue is durable: under Node it is a file in
// ~/.bridge/usage-queue, replayed by the next reporter. Hide
// `process.versions.node` while the reporter is built so it stays in memory,
// as in an edge runtime.
const originalVersions = process.versions;

beforeAll(() => {
  g.IS_REACT_ACT_ENVIRONMENT = true;
  g.WebSocket = FakeWebSocket;
  console.warn = () => {};
  console.info = () => {};
  console.error = () => {};
  console.log = () => {};
});
afterAll(() => {
  console.warn = realWarn;
  console.error = realError;
  console.info = realInfo;
  console.log = realLog;
});

beforeEach(() => {
  Object.defineProperty(process, 'versions', { configurable: true, value: { ...originalVersions, node: undefined } });
  used = 0;
  ingested = [];
  g.fetch = async (input: unknown, init?: { method?: string; body?: unknown }) => {
    const url = String(input);
    const path = url.startsWith(API) ? url.slice(API.length).split('?')[0] : url;
    if (path === '/usage/quota/qr_codes') {
      return response(200, { metric: 'qr_codes', used, limit: 1, remaining: 1 - used, policy: 'hard', kind: 'counter', warningLevel: null });
    }
    if (path === '/usage/ingest') {
      const body = JSON.parse(String(init?.body)) as { metric: string; value: number };
      ingested.push({ metric: body.metric, value: body.value });
      if (body.metric === 'qr_codes') used += body.value;
      return response(201, {});
    }
    if (path === `/admin/flags-internal/flags-cache/${APP}`) return response(200, FLAGS);
    if (path === '/auth/token') return response(201, { access_token: sessionToken(), refresh_token: 'r2', id_token: 'i' });
    return response(404, {});
  };
  // A signed-in session from an earlier visit, as a reload finds it.
  localStorage.setItem(`bridge_tokens:${APP}`, JSON.stringify({ accessToken: sessionToken(), refreshToken: 'r', idToken: 'i' }));
  __resetBridgeRuntime();
  _resetBridgeInstance();
  useBillingBridge().quotas.__resetForTests();
});

afterEach(async () => {
  const current = root;
  root = null;
  if (current) await act(async () => current.unmount());
  container?.remove();
  localStorage.removeItem(`bridge_tokens:${APP}`);
  Object.defineProperty(process, 'versions', { configurable: true, value: originalVersions });
  setBridgeFlagsInstance(undefined);
  __resetBridgeRuntime();
  _resetBridgeInstance();
  useBillingBridge().quotas.__resetForTests();
});

let type: (text: string) => void = () => {};

/** The QR Studio page from the test run, cut down: a text box, three flags, the gate. */
function Studio() {
  const [text, setText] = React.useState('');
  type = setText;
  const svg = useFlag('download-svg', false);
  return (
    <main>
      <input value={text} onChange={(e) => setText(e.target.value)} />
      <FeatureFlag flagKey="custom-colors" defaultValue={false}>
        <span data-testid="colors">Colors</span>
      </FeatureFlag>
      <FeatureFlag flagKey="custom-logo" defaultValue={false}>
        <span>Logo</span>
      </FeatureFlag>
      {svg.value ? <button>Download SVG</button> : null}
      <QuotaGate metric="qr_codes">
        <button data-testid="create" onClick={() => bridge.usage.report('qr_codes', 1)}>
          Create QR code
        </button>
      </QuotaGate>
    </main>
  );
}

async function until(check: () => boolean, timeoutMs: number): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (check()) return true;
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
  }
  return check();
}

describe('TBP-942 — a report at the limit closes the gate without a reload', () => {
  it('closes within ~2 s on a page that has just been re-rendering, and counts every evaluation', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root!.render(
        <React.StrictMode>
          <BridgeProvider appId={APP} config={{ apiBaseUrl: API, devBadge: false, billing: { paywallRoute: false } }}>
            <Studio />
          </BridgeProvider>
        </React.StrictMode>,
      );
    });
    const gate = () => container.querySelector('[data-bridge-quota-gate]')?.getAttribute('data-state');
    expect(await until(() => gate() === 'available' && !!container.querySelector('[data-testid="colors"]'), 3000)).toBe(true);

    // The user types a URL: one re-render per keystroke.
    const url = 'https://example.com/free-1';
    for (let i = 1; i <= 25; i++) {
      await act(async () => type(url.slice(0, i)));
    }

    await act(async () => (container.querySelector('[data-testid="create"]') as HTMLButtonElement).click());

    // Bridge accepts the report, the page reads its usage back (TBP-700) and
    // the gate closes — no reload, well before the user could click again.
    expect(await until(() => gate() === 'at-limit', 3000)).toBe(true);
    expect(used).toBe(1);
    expect((container.querySelector('[data-testid="create"]')!.closest('fieldset') as HTMLFieldSetElement).disabled).toBe(true);

    // The SDK's own count is still reported in full — as a few summed events.
    await until(() => false, 1500);
    const evaluationEvents = ingested.filter((e) => e.metric === 'bridge.flag_evaluations');
    expect(evaluationEvents.reduce((n, e) => n + e.value, 0)).toBeGreaterThan(25);
    expect(evaluationEvents.length).toBeLessThan(10);
  }, 15000);
});

describe('TBP-942 — the flag-evaluation count, summed before it is queued', () => {
  it('many reports of one metric reach the queue as one report carrying the sum; keyed reports pass through', async () => {
    const seen: unknown[][] = [];
    const counter = coalesceUsageReports({ report: (...a: unknown[]) => void seen.push(a) }, 20);
    for (let i = 0; i < 250; i++) counter.report('bridge.flag_evaluations', 1);
    counter.report('exports', 1, 'k-1');
    expect(seen).toEqual([['exports', 1, 'k-1']]);
    await new Promise((r) => setTimeout(r, 40));
    expect(seen).toEqual([['exports', 1, 'k-1'], ['bridge.flag_evaluations', 250]]);
    counter.report('bridge.flag_evaluations', 1);
    counter.stop();
    expect(seen[2]).toEqual(['bridge.flag_evaluations', 1]);
  });
});
