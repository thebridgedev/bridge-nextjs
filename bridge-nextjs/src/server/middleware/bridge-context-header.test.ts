/**
 * TBP-671 — a client-supplied `x-bridge-context` is never forwarded or trusted.
 *
 * Regression: the feature-flag middleware returned a plain `NextResponse.next()`
 * when there was no verified context, and every `withBridgeAuth` / `withAuth`
 * pass-through did the same — which forwards the incoming request headers
 * untouched. A browser could send `x-bridge-context` claiming
 * `tenant.plan: enterprise` and a victim's `sub`, and the app passed it on to a
 * nestjs backend that trusted it. `requireFeatureFlagForRoute` handed its
 * handler the raw request, so a proxying handler did the same.
 *
 * How Next forwards: `NextResponse.next({ request: { headers } })` replaces the
 * request headers with exactly the listed set (`x-middleware-override-headers`);
 * a plain `NextResponse.next()` has no override and forwards the originals.
 */
import { NextRequest, NextResponse } from 'next/server';
import { SignJWT, exportJWK, generateKeyPair, type CryptoKey, type JWK } from 'jose';
import { deserializeContext, serializeContext } from '@nebulr-group/bridge-auth-core';
import { webcrypto } from 'node:crypto';

if (!(globalThis as { crypto?: unknown }).crypto) {
  (globalThis as { crypto?: unknown }).crypto = webcrypto;
}

const API = 'https://api.test.local';
const ISSUER = `${API}/auth`;
const APP_ID = 'app-1';

const env = process.env as Record<string, string | undefined>;
const savedEnv = { ...env };
env.NEXT_PUBLIC_BRIDGE_APP_ID = APP_ID;
env.NEXT_PUBLIC_BRIDGE_API_BASE_URL = API;
delete env.NEXT_PUBLIC_BRIDGE_LOGIN_ROUTE;

jest.mock('../utils/init-services', () => ({
  initServices: jest.fn().mockImplementation(async (cfg?: unknown) => {
    const { getConfig } = jest.requireActual('../utils/get-config');
    const { TokenServiceServer } = jest.requireActual('../utils/token-service.server');
    const config = cfg ?? getConfig();
    const tokenService = TokenServiceServer.getInstance();
    tokenService.init(config);
    return { config, tokenService, authService: { createLoginUrl: () => 'https://auth.example/login' } };
  }),
}));

jest.mock('../../shared/services/auth.service', () => ({
  AuthService: {
    getInstance: () => ({ init: jest.fn(), createLoginUrl: () => 'https://auth.example/login' }),
  },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { withBridgeAuth } = require('./with-bridge-auth');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { withFeatureFlags } = require('./feature-flag-middleware');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { requireFeatureFlagForRoute } = require('../utils/route-handlers');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { FeatureFlagServer } = require('../utils/feature-flag.server');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { __resetSessionVerificationForTests } = require('../utils/verify-session');

/** What an attacker sends: an enterprise plan for somebody else's user id. */
const SPOOFED = serializeContext({ identity: 'victim-user', attributes: { 'tenant.plan': 'enterprise' } } as never);

let bridgeKey: CryptoKey;
let publicJwk: JWK;
let savedFetch: typeof fetch | undefined;

beforeAll(async () => {
  const pair = await generateKeyPair('PS256', { extractable: true });
  bridgeKey = pair.privateKey;
  publicJwk = { ...(await exportJWK(pair.publicKey)), kid: 'bridge-key-1', use: 'sig' };
});

beforeEach(() => {
  __resetSessionVerificationForTests();
  delete env.NEXT_PUBLIC_BRIDGE_LOGIN_ROUTE;
  savedFetch = globalThis.fetch;
  globalThis.fetch = jest.fn(async (input: unknown) => {
    const url = String(input instanceof URL ? input.href : input);
    const ok = url === `${ISSUER}/.well-known/jwks.json`;
    const body = ok ? { keys: [publicJwk] } : [];
    return { status: ok ? 200 : 404, ok, headers: { get: () => 'application/json' }, json: async () => body };
  }) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = savedFetch as typeof fetch;
  jest.restoreAllMocks();
});

afterAll(() => {
  for (const k of Object.keys(env)) if (!(k in savedEnv)) delete env[k];
  Object.assign(env, savedEnv);
});

const validToken = () =>
  new SignJWT({ sub: 'user-1', tid: 'ws-1', plan: 'free' })
    .setProtectedHeader({ alg: 'PS256', kid: 'bridge-key-1' })
    .setIssuer(ISSUER)
    .setAudience(APP_ID)
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(bridgeKey);

const b64url = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');
const FORGED = `${b64url({ alg: 'PS256' })}.${b64url({ sub: 'victim-user', plan: 'enterprise', exp: 9999999999 })}.x`;

function request(path: string, opts: { token?: string; headerName?: string; method?: string; body?: string } = {}): NextRequest {
  return new NextRequest(`http://localhost:3000${path}`, {
    method: opts.method ?? 'GET',
    body: opts.body,
    headers: {
      accept: 'text/html,application/xhtml+xml',
      [opts.headerName ?? 'x-bridge-context']: SPOOFED,
      ...(opts.token ? { cookie: `bridge_access_token=${opts.token}` } : {}),
    },
  });
}

/**
 * The request headers Next will hand to the app for this middleware response,
 * or `null` when the middleware did not override them (= originals forwarded).
 */
function forwardedHeaders(res: NextResponse): Record<string, string | null> | null {
  const list = res.headers.get('x-middleware-override-headers');
  if (list === null) return null;
  const out: Record<string, string | null> = {};
  for (const name of list.split(',').filter(Boolean)) out[name] = res.headers.get(`x-middleware-request-${name}`);
  return out;
}

function expectStripped(res: NextResponse): void {
  const forwarded = forwardedHeaders(res);
  expect(forwarded).not.toBeNull(); // a plain next() forwards the spoofed header
  expect(Object.keys(forwarded!)).not.toContain('x-bridge-context');
}

describe('feature-flag middleware', () => {
  const mw = () => withFeatureFlags([]);

  it('strips a spoofed context when there is no session', async () => {
    expectStripped(await mw()(request('/anything')));
  });

  it('strips a spoofed context sent with a forged cookie, whatever the header case', async () => {
    expectStripped(await mw()(request('/anything', { token: FORGED, headerName: 'X-Bridge-Context' })));
  });

  it('replaces it with the verified context when the session is valid', async () => {
    const forwarded = forwardedHeaders(await mw()(request('/anything', { token: await validToken() })));
    const ctx = deserializeContext(forwarded?.['x-bridge-context'] ?? '');
    expect(ctx?.identity).toBe('user-1');
    expect(ctx?.attributes?.['tenant.plan']).toBe('free');
  });
});

describe('withBridgeAuth', () => {
  it('strips a spoofed context on a public route', async () => {
    const mw = withBridgeAuth({ defaultAccess: 'public' });
    expectStripped(await mw(request('/pricing')));
  });

  it('strips a spoofed context when a valid session passes a protected route', async () => {
    const mw = withBridgeAuth({});
    expectStripped(await mw(request('/dashboard', { token: await validToken() })));
  });

  it('strips a spoofed context on the SDK-auth pass-through', async () => {
    env.NEXT_PUBLIC_BRIDGE_LOGIN_ROUTE = '/auth/login';
    const mw = withBridgeAuth({});
    expectStripped(await mw(request('/dashboard')));
  });

  it('a spoofed context does not change the guard decision', async () => {
    const res = await withBridgeAuth({})(request('/dashboard'));
    expect(res.headers.get('location')).toBe('https://auth.example/login');
  });
});

describe('requireFeatureFlagForRoute', () => {
  function route(seen: Array<string | null>) {
    jest.spyOn(FeatureFlagServer.getInstance(), 'isFeatureEnabledServer').mockResolvedValue(true);
    return requireFeatureFlagForRoute('api-feature', async (req: NextRequest) => {
      seen.push(req.headers.get('x-bridge-context'));
      return NextResponse.json({ body: req.method === 'POST' ? await req.text() : null });
    });
  }

  it('the handler never sees a spoofed context, and the response does not carry one', async () => {
    const seen: Array<string | null> = [];
    const res = await route(seen)(request('/api/data', { token: FORGED }));
    expect(seen).toEqual([null]);
    expect(res.headers.get('x-bridge-context')).toBeNull();
  });

  it('with a valid session the handler sees the verified context instead', async () => {
    const seen: Array<string | null> = [];
    const res = await route(seen)(request('/api/data', { token: await validToken() }));
    expect(deserializeContext(seen[0] ?? '')?.identity).toBe('user-1');
    expect(deserializeContext(res.headers.get('x-bridge-context') ?? '')?.identity).toBe('user-1');
  });

  it('the handler still gets the request body', async () => {
    const res = await route([])(request('/api/data', { method: 'POST', body: '{"a":1}' }));
    await expect(res.json()).resolves.toEqual({ body: '{"a":1}' });
  });
});

describe('server flag evaluation ignores an inbound context', () => {
  const flags = () => {
    const server = FeatureFlagServer.getInstance();
    server.init({ appId: APP_ID, apiBaseUrl: API, authBaseUrl: ISSUER });
    return server;
  };

  it('a spoofed header alone yields no context', async () => {
    await expect(flags().buildVerifiedContextFromRequest(request('/'))).resolves.toBeUndefined();
  });

  it('with a valid session the context comes from the token, not the header', async () => {
    const ctx = await flags().buildVerifiedContextFromRequest(request('/', { token: await validToken() }));
    expect(ctx?.identity).toBe('user-1');
    expect(ctx?.attributes?.['tenant.plan']).toBe('free');
  });
});
