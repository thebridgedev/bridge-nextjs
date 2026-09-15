/**
 * TBP-666 (security review) — the middleware VERIFIES the session cookie.
 *
 * Regression: `isAuthenticatedServer` only decoded `bridge_access_token` and
 * checked `exp`, so a hand-written `header.{"exp":9999999999}.x` cookie passed
 * every protected route in hosted mode. Now the token must be signed by a key
 * in the Bridge JWKS with PS256, carry iss = `<apiBaseUrl>/auth`, aud = appId,
 * and be current.
 *
 * The REAL TokenServiceServer and verifier run here; only the network is
 * faked: the JWKS endpoint serves a test key pair's public half.
 */
import { NextRequest } from 'next/server';
import { SignJWT, UnsecuredJWT, exportJWK, generateKeyPair, type CryptoKey, type JWK } from 'jose';
import { webcrypto } from 'node:crypto';

if (!(globalThis as { crypto?: unknown }).crypto) {
  (globalThis as { crypto?: unknown }).crypto = webcrypto;
}

const API = 'https://api.test.local';
const ISSUER = `${API}/auth`;
const APP_ID = 'app-1';
const HOSTED_LOGIN = 'https://auth.example/login';

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
const { FeatureFlagServer } = require('../utils/feature-flag.server');
// Optional so this suite also loads against the pre-fix sources, where the
// forged-token cases demonstrate the hole (they are let in).
const { __resetSessionVerificationForTests } = (() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('../utils/verify-session');
  } catch {
    return { __resetSessionVerificationForTests: () => {} };
  }
})();

let bridgeKey: CryptoKey;
let attackerKey: CryptoKey;
let publicJwk: JWK;
let savedFetch: typeof fetch | undefined;

beforeAll(async () => {
  const bridge = await generateKeyPair('PS256', { extractable: true });
  const attacker = await generateKeyPair('PS256', { extractable: true });
  bridgeKey = bridge.privateKey;
  attackerKey = attacker.privateKey;
  // Like the real Bridge JWKS: RSA, `use: sig`, no `alg` member.
  publicJwk = { ...(await exportJWK(bridge.publicKey)), kid: 'bridge-key-1', use: 'sig' };
});

beforeEach(() => {
  __resetSessionVerificationForTests();
  savedFetch = globalThis.fetch;
  globalThis.fetch = jest.fn(async (input: unknown) => {
    const url = String(input instanceof URL ? input.href : input);
    const body = url === `${ISSUER}/.well-known/jwks.json` ? { keys: [publicJwk] } : {};
    const status = url === `${ISSUER}/.well-known/jwks.json` ? 200 : 404;
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

afterAll(() => {
  for (const k of Object.keys(env)) if (!(k in savedEnv)) delete env[k];
  Object.assign(env, savedEnv);
});

const b64url = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');

function sign(
  claims: Record<string, unknown>,
  opts: { key?: CryptoKey; alg?: string; iss?: string; aud?: string; exp?: string | number } = {},
): Promise<string> {
  return new SignJWT({ sub: 'user-1', tid: 'ws-1', plan: 'free', ...claims })
    .setProtectedHeader({ alg: opts.alg ?? 'PS256', kid: 'bridge-key-1' })
    .setIssuer(opts.iss ?? ISSUER)
    .setAudience(opts.aud ?? APP_ID)
    .setIssuedAt()
    .setExpirationTime(opts.exp ?? '1h')
    .sign(opts.key ?? bridgeKey);
}

function pageRequest(path: string, token?: string): NextRequest {
  return new NextRequest(`http://localhost:3000${path}`, {
    headers: {
      accept: 'text/html,application/xhtml+xml',
      ...(token ? { cookie: `bridge_access_token=${token}` } : {}),
    },
  });
}

const passedThrough = (res: Response) => res.headers.get('x-middleware-next') === '1';
const protectedByDefault = () => withBridgeAuth({ rules: [{ match: '/', public: true }] });

describe('hosted mode: a forged or foreign session cookie is not a session', () => {
  it('a valid Bridge token for this app gets in', async () => {
    const res = await protectedByDefault()(pageRequest('/dashboard', await sign({})));
    expect(passedThrough(res)).toBe(true);
  });

  const rejected: Array<[string, () => Promise<string>]> = [
    [
      'an unsigned forgery with a far-future exp (the reported bypass)',
      async () => `${b64url({ alg: 'PS256', typ: 'JWT' })}.${b64url({ sub: 'x', exp: 9999999999 })}.x`,
    ],
    [
      'an `alg: none` token with the right claims',
      async () =>
        new UnsecuredJWT({ sub: 'x' }).setIssuer(ISSUER).setAudience(APP_ID).setExpirationTime('1h').encode(),
    ],
    ['a token signed by someone else\'s key', () => sign({}, { key: attackerKey })],
    ['a token from another issuer', () => sign({}, { iss: 'https://evil.test/auth' })],
    ['a token for another app', () => sign({}, { aud: 'some-other-app' })],
    ['an expired token', () => sign({}, { exp: Math.floor(Date.now() / 1000) - 60 })],
  ];

  for (const [name, token] of rejected) {
    it(`${name} is sent to login`, async () => {
      const res = await protectedByDefault()(pageRequest('/dashboard', await token()));
      expect(passedThrough(res)).toBe(false);
      expect(res.headers.get('location')).toBe(HOSTED_LOGIN);
    });
  }

  it('an unreachable JWKS denies (fail closed)', async () => {
    globalThis.fetch = jest.fn(async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;
    const res = await protectedByDefault()(pageRequest('/dashboard', await sign({})));
    expect(passedThrough(res)).toBe(false);
  });

  it('a forged cookie does not get a flag rule evaluated as a signed-in user', async () => {
    const forged = `${b64url({ alg: 'PS256' })}.${b64url({ sub: 'x', plan: 'enterprise', exp: 9999999999 })}.x`;
    const mw = withBridgeAuth({ rules: [{ match: '/beta', featureFlag: 'beta' }] });
    const res = await mw(pageRequest('/beta', forged));
    expect(res.headers.get('location')).toBe(HOSTED_LOGIN);
  });
});

describe('flag context: claims come from the verified token only', () => {
  const flags = () => {
    const server = FeatureFlagServer.getInstance();
    server.init({ appId: APP_ID, apiBaseUrl: API, authBaseUrl: ISSUER });
    return server;
  };

  it('a valid token yields its identity and plan', async () => {
    const ctx = await flags().buildVerifiedContextFromRequest(pageRequest('/', await sign({ plan: 'pro' })));
    expect(ctx).toEqual({
      identity: 'user-1',
      attributes: expect.objectContaining({ 'tenant.plan': 'pro', 'tenant.id': 'ws-1' }),
    });
  });

  it('a forged token claiming plan "enterprise" yields no context at all', async () => {
    const forged = `${b64url({ alg: 'PS256' })}.${b64url({ sub: 'x', plan: 'enterprise', exp: 9999999999 })}.x`;
    await expect(flags().buildVerifiedContextFromRequest(pageRequest('/', forged))).resolves.toBeUndefined();
    await expect(flags().serializeVerifiedContextForRequest(pageRequest('/', forged))).resolves.toBeUndefined();
  });
});
