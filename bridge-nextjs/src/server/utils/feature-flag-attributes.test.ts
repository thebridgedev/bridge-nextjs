/**
 * TBP-757 — flag rules on the server see the same role, privileges, plan and
 * plan features as the browser, with no wiring.
 *
 * The server evaluates flags locally (backend-mode BridgeFlags). Its context
 * used a hand-rolled claim mapping (no `user.id`) and nothing about the
 * workspace's billing, so a rule on `bridge:billing.plan` or an entitlement was
 * never true on the server while the browser said yes. Now: auth-core's
 * `claimsToAttributes` over the VERIFIED token, plus `bridge:billing.*` from
 * Bridge's `/session/init`, cached per workspace and dropped when a newer token
 * carries a different plan. Nothing the client sends is used.
 *
 * The real verifier runs; only the network is faked (JWKS, flags-cache,
 * /session/init).
 */
import { NextRequest } from 'next/server';
import { SignJWT, exportJWK, generateKeyPair, type CryptoKey, type JWK } from 'jose';
import { webcrypto } from 'node:crypto';

if (!(globalThis as { crypto?: unknown }).crypto) {
  (globalThis as { crypto?: unknown }).crypto = webcrypto;
}

const API = 'https://api.test.local';
const ISSUER = `${API}/auth`;
const APP_ID = 'app-757';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { FeatureFlagServer } = require('./feature-flag.server');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { __resetSessionVerificationForTests } = require('./verify-session');

const cond = (attribute: string, operator: string, values: unknown[]) => ({ attribute, operator, values });
const ruleFlag = (key: string, conditions: unknown[]) => ({
  key,
  state: 'on-with-rule',
  valueType: 'boolean',
  offValue: false,
  onValue: true,
  rule: { branches: [{ conditions, returnValue: true }], otherwiseValue: false, rolloutPct: 100 },
});
const FLAGS = [
  ruleFlag('own-page', [cond('user.id', 'eq', ['user-1'])]),
  ruleFlag('admin-page', [cond('user.role', 'eq', ['ADMIN'])]),
  ruleFlag('pro-page', [cond('bridge:billing.plan', 'eq', ['pro'])]),
  ruleFlag('reports', [cond('bridge:billing.entitlement.reports', 'eq', [true])]),
];

let bridgeKey: CryptoKey;
let publicJwk: JWK;
let savedFetch: typeof fetch | undefined;
/** What Bridge's /session/init says per workspace; `undefined` = unreachable. */
let sessions: Record<string, unknown> = {};
let sessionCalls: Array<{ auth: string | undefined; appId: string | undefined }> = [];

beforeAll(async () => {
  const bridge = await generateKeyPair('PS256', { extractable: true });
  bridgeKey = bridge.privateKey;
  publicJwk = { ...(await exportJWK(bridge.publicKey)), kid: 'bridge-key-1', use: 'sig' };
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

beforeEach(() => {
  __resetSessionVerificationForTests();
  sessions = {};
  sessionCalls = [];
  savedFetch = globalThis.fetch;
  globalThis.fetch = jest.fn(async (input: unknown, init?: { headers?: Record<string, string> }) => {
    const url = String(input instanceof URL ? input.href : input);
    let status = 404;
    let body: unknown = {};
    if (url === `${ISSUER}/.well-known/jwks.json`) {
      status = 200;
      body = { keys: [publicJwk] };
    } else if (url === `${API}/admin/flags-internal/flags-cache/${APP_ID}`) {
      status = 200;
      body = FLAGS;
    } else if (url === `${API}/session/init`) {
      const auth = init?.headers?.Authorization;
      sessionCalls.push({ auth, appId: init?.headers?.['x-app-id'] });
      const tid = JSON.parse(Buffer.from(String(auth).split('.')[1], 'base64url').toString()).tid as string;
      if (sessions[tid] !== undefined) {
        status = 200;
        body = sessions[tid];
      } else {
        status = 503;
      }
    }
    return {
      status,
      ok: status === 200,
      headers: { get: () => 'application/json' },
      json: async () => body,
      text: async () => JSON.stringify(body),
    };
  }) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = savedFetch as typeof fetch;
});

function sign(claims: Record<string, unknown>, iat?: number): Promise<string> {
  const jwt = new SignJWT({ sub: 'user-1', plan: 'free', ...claims })
    .setProtectedHeader({ alg: 'PS256', kid: 'bridge-key-1' })
    .setIssuer(ISSUER)
    .setAudience(APP_ID)
    .setExpirationTime('1h');
  return (iat ? jwt.setIssuedAt(iat) : jwt.setIssuedAt()).sign(bridgeKey);
}

function request(token: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://localhost:3000/x', { headers: { cookie: `bridge_access_token=${token}`, ...headers } });
}

const session = (plan: string, entitlements: Record<string, boolean> = {}) => ({
  tenant: { id: 't', name: 'T', subscription: { plan: { slug: plan, name: plan }, status: 'active' }, entitlements },
});

const flags = () => {
  const server = FeatureFlagServer.getInstance();
  server.init({ appId: APP_ID, apiBaseUrl: API, authBaseUrl: ISSUER });
  return server;
};

describe('server flag rules see what the browser sees (TBP-757)', () => {
  it('the verified token gives user.id and user.role, like the browser', async () => {
    const admin = await sign({ tid: 'ws-a', role: 'ADMIN' });
    const member = await sign({ tid: 'ws-a', role: 'MEMBER', sub: 'user-2' });
    await expect(flags().isFeatureEnabledServer('own-page', request(admin))).resolves.toBe(true);
    await expect(flags().isFeatureEnabledServer('own-page', request(member))).resolves.toBe(false);
    await expect(flags().isFeatureEnabledServer('admin-page', request(admin))).resolves.toBe(true);
    await expect(flags().isFeatureEnabledServer('admin-page', request(member))).resolves.toBe(false);
  });

  it('the plan and plan features come from Bridge, read with the verified token', async () => {
    sessions['ws-b'] = session('pro', { reports: true });
    const token = await sign({ tid: 'ws-b', plan: 'free' }); // the claim lags; Bridge is the source
    await expect(flags().isFeatureEnabledServer('pro-page', request(token))).resolves.toBe(true);
    await expect(flags().isFeatureEnabledServer('reports', request(token))).resolves.toBe(true);
    expect(sessionCalls[0]).toEqual({ auth: `Bearer ${token}`, appId: APP_ID });
    expect(sessionCalls).toHaveLength(1); // cached per workspace
  });

  it('a newer token with a different plan re-reads the workspace instead of waiting for the cache', async () => {
    sessions['ws-c'] = session('free');
    const before = await sign({ tid: 'ws-c', plan: 'free' }, 1_000_000);
    await expect(flags().isFeatureEnabledServer('pro-page', request(before))).resolves.toBe(false);

    sessions['ws-c'] = session('pro'); // the upgrade
    const after = await sign({ tid: 'ws-c', plan: 'pro' }, 1_000_100);
    await expect(flags().isFeatureEnabledServer('pro-page', request(after))).resolves.toBe(true);
    expect(sessionCalls).toHaveLength(2);
  });

  it('attributes a client sends are never used', async () => {
    sessions['ws-d'] = session('free');
    const token = await sign({ tid: 'ws-d', plan: 'free' });
    const forged = Buffer.from(
      JSON.stringify({ identity: 'user-1', attributes: { 'bridge:billing.plan': 'pro', 'user.role': 'ADMIN' } }),
    ).toString('base64');
    const req = request(token, { 'x-bridge-context': forged });
    await expect(flags().isFeatureEnabledServer('pro-page', req)).resolves.toBe(false);
    await expect(flags().isFeatureEnabledServer('admin-page', req)).resolves.toBe(false);
  });

  it('Bridge unreachable: rules on the verified claims still answer; billing rules see no value', async () => {
    const token = await sign({ tid: 'ws-e', role: 'ADMIN' }); // no session for ws-e → 503
    await expect(flags().isFeatureEnabledServer('admin-page', request(token))).resolves.toBe(true);
    await expect(flags().isFeatureEnabledServer('pro-page', request(token))).resolves.toBe(false);
  });

  it('flagServer and loadAllFlagsServer use the same context', async () => {
    sessions['ws-f'] = session('pro', { reports: true });
    const token = await sign({ tid: 'ws-f', role: 'ADMIN' });
    await expect(flags().flagServer('pro-page', false, request(token))).resolves.toBe(true);
    await expect(flags().loadAllFlagsServer(request(token))).resolves.toEqual({
      'own-page': true,
      'admin-page': true,
      'pro-page': true,
      reports: true,
    });
  });
});
