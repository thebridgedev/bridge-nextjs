/**
 * @jest-environment jsdom
 *
 * TBP-948 (port of bridge-svelte TBP-697) — in development, one warning when
 * the browser and the backend both count the same usage metric.
 *
 * The rule is "count once, where the action happens". Outside production
 * bridge-nestjs marks a counting endpoint's response with
 * `X-Bridge-Usage-Counted: <metric>`; when the page also reports that metric
 * with `bridge.usage`, every action is counted twice and nothing else says so.
 *
 * Revert-proof: on origin/main nothing reads the header and nothing warns.
 */
import { bridge } from './bridge';
import { bridgeFetch, installQuotaRefusalObserver } from './bridge-fetch';
import { _resetBridgeInstance, initBridge } from './bridge-instance';

type Reset = { __resetDoubleCountWarning?: () => void };
const warning: Reset = (() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('./double-count-warning');
  } catch {
    return {};
  }
})();

const g = globalThis as unknown as Record<string, unknown>;
const env = process.env as Record<string, string | undefined>;
const originalEnv = env.NODE_ENV;
const originalVersions = process.versions;

function answer(counted?: string) {
  return {
    ok: true,
    status: 200,
    statusText: '',
    headers: new Headers(counted ? { 'X-Bridge-Usage-Counted': counted } : {}),
    json: async () => ({}),
    text: async () => '{}',
    clone() {
      return this;
    },
  } as unknown as Response;
}

let warn: jest.SpyInstance;
let restoreObserver: (() => void) | undefined;

beforeEach(() => {
  // Keep auth-core's durable usage queue in memory, not in ~/.bridge.
  Object.defineProperty(process, 'versions', { configurable: true, value: { ...originalVersions, node: undefined } });
  env.NODE_ENV = 'development';
  _resetBridgeInstance();
  warning.__resetDoubleCountWarning?.();
  g.fetch = async () => answer('qr_codes');
  window.fetch = g.fetch as typeof fetch;
  initBridge({ appId: 'app-1', apiBaseUrl: 'http://api.test.local' } as never);
  warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  restoreObserver?.();
  restoreObserver = undefined;
  warn.mockRestore();
  env.NODE_ENV = originalEnv;
  Object.defineProperty(process, 'versions', { configurable: true, value: originalVersions });
  _resetBridgeInstance();
});

const doubleCountWarnings = () =>
  warn.mock.calls.filter((args) => String(args[0]).includes('is counted twice'));

describe('TBP-948 — the double-count warning (development only)', () => {
  it('the backend says it counted a metric and the page reports it too: one warning naming it', async () => {
    await bridgeFetch('/api/qr-codes', { method: 'POST' });
    bridge.usage.report('qr_codes', 1);
    bridge.usage.report('qr_codes', 1);
    await bridgeFetch('/api/qr-codes', { method: 'POST' });

    expect(doubleCountWarnings()).toHaveLength(1);
    expect(String(doubleCountWarnings()[0][0])).toContain("'qr_codes'");
    expect(String(doubleCountWarnings()[0][0])).toContain('Count once, where the action happens');
  });

  it('works in either order, and through a plain fetch once <BridgeProvider> has installed its observer', async () => {
    restoreObserver = installQuotaRefusalObserver();
    bridge.usage.report('qr_codes', 1);
    await window.fetch('/api/qr-codes', { method: 'POST' });
    expect(doubleCountWarnings()).toHaveLength(1);
  });

  it('bridge.usage.set counts as the browser counting', async () => {
    await bridgeFetch('/api/seats');
    g.fetch = async () => answer('seats');
    await bridgeFetch('/api/seats');
    // Signed out here, so auth-core refuses the write — after it was noted.
    await bridge.usage.set('seats', 3).catch(() => undefined);
    expect(doubleCountWarnings()).toHaveLength(1);
    expect(String(doubleCountWarnings()[0][0])).toContain("'seats'");
  });

  it('different metrics on each side: no warning', async () => {
    await bridgeFetch('/api/qr-codes', { method: 'POST' });
    bridge.usage.report('exports', 1);
    expect(doubleCountWarnings()).toHaveLength(0);
  });

  it('a response that names several metrics is read as a list', async () => {
    g.fetch = async () => answer('exports, qr_codes');
    await bridgeFetch('/api/batch');
    bridge.usage.report('qr_codes', 1);
    expect(doubleCountWarnings()).toHaveLength(1);
  });

  it('in production nothing is recorded and nothing is printed', async () => {
    env.NODE_ENV = 'production';
    await bridgeFetch('/api/qr-codes', { method: 'POST' });
    bridge.usage.report('qr_codes', 1);
    expect(doubleCountWarnings()).toHaveLength(0);
  });
});
