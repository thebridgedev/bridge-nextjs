/**
 * TBP-666 — which requests `withBridgeAuth` is the guard for.
 *
 * Regression: with `defaultAccess: 'public'`, a matching `{ public: false }`
 * rule was skipped and the request let through — true since 0.1.0, and the
 * exact config the JSDoc and the demo recommend. Fixed by the model below.
 *
 * - Hosted mode (no `loginRoute`): the session is a cookie the middleware can
 *   read, so it enforces, and an error while deciding denies.
 * - SDK-auth mode (`loginRoute` set): tokens live in the browser. With no Bridge
 *   session cookie the middleware is explicitly non-authoritative — it lets the
 *   request through (no login loop) and says so once, in development only.
 *
 * Uses the REAL config resolution (`getConfig`), which decides the mode.
 */
import { NextRequest } from 'next/server';
import { DEFAULT_RETURN_TO_PARAM } from '@nebulr-group/bridge-auth-core';
import { RETURN_TO_COOKIE } from '../utils/return-to';

const HOSTED_LOGIN = 'https://auth.example/login?client_id=app-1';
const mockIsAuthenticatedServer = jest.fn();
const mockCreateLoginUrl = jest.fn().mockReturnValue(HOSTED_LOGIN);

jest.mock('../utils/init-services', () => ({
  initServices: jest.fn().mockImplementation(async (cfg?: unknown) => ({
    config: cfg ?? jest.requireActual('../utils/get-config').getConfig(),
    tokenService: {
      isAuthenticatedServer: mockIsAuthenticatedServer,
      getAccessTokenServer: jest.fn().mockReturnValue('valid-token'),
      getTokenExpiryTime: jest.fn().mockReturnValue(null),
      formatTimeUntilExpiry: jest.fn().mockReturnValue(''),
      refreshTokenIfNeeded: jest.fn().mockResolvedValue(false),
    },
    authService: { createLoginUrl: mockCreateLoginUrl },
  })),
}));

jest.mock('../utils/token-service.server', () => ({
  TokenServiceServer: {
    getInstance: () => ({ init: jest.fn(), isAuthenticatedServer: mockIsAuthenticatedServer }),
  },
}));

jest.mock('../../shared/services/auth.service', () => ({
  AuthService: {
    getInstance: () => ({ init: jest.fn(), createLoginUrl: mockCreateLoginUrl }),
  },
}));

jest.mock('../utils/feature-flag.server', () => ({
  FeatureFlagServer: {
    getInstance: () => ({ init: jest.fn(), isFeatureEnabledServer: jest.fn().mockResolvedValue(true) }),
  },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { withBridgeAuth } = require('./with-bridge-auth');

function pageRequest(path: string, cookie?: string): NextRequest {
  return new NextRequest(`http://localhost:3000${path}`, {
    headers: { accept: 'text/html,application/xhtml+xml', ...(cookie ? { cookie } : {}) },
  });
}

function apiRequest(path: string): NextRequest {
  return new NextRequest(`http://localhost:3000${path}`, {
    headers: { accept: 'application/json', authorization: 'Bearer sdk-token-from-localStorage' },
  });
}

/** `NextResponse.next()` — the request continues to the page. */
function passedThrough(res: Response): boolean {
  return res.headers.get('x-middleware-next') === '1';
}

const env = process.env as Record<string, string | undefined>;
const LOGIN_ROUTE_ENV = 'NEXT_PUBLIC_BRIDGE_LOGIN_ROUTE';
let savedLoginRoute: string | undefined;
let savedNodeEnv: string | undefined;
let warn: jest.SpyInstance;

beforeEach(() => {
  savedLoginRoute = env[LOGIN_ROUTE_ENV];
  savedNodeEnv = env.NODE_ENV;
  delete env[LOGIN_ROUTE_ENV];
  mockIsAuthenticatedServer.mockReset().mockResolvedValue(false);
  warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  if (savedLoginRoute === undefined) delete env[LOGIN_ROUTE_ENV];
  else env[LOGIN_ROUTE_ENV] = savedLoginRoute;
  env.NODE_ENV = savedNodeEnv;
  warn.mockRestore();
});

const publicByDefault = {
  defaultAccess: 'public' as const,
  rules: [{ match: '/dashboard', public: false }],
};

describe('hosted mode — the middleware can see the session, so it guards', () => {
  it("enforces a `public: false` rule under defaultAccess 'public': login redirect with the deep link remembered", async () => {
    const res = await withBridgeAuth(publicByDefault)(pageRequest('/dashboard/reports?q=1'));

    expect(res.headers.get('location')).toBe(HOSTED_LOGIN);
    expect(decodeURIComponent(res.cookies.get(RETURN_TO_COOKIE)?.value ?? '')).toBe('/dashboard/reports?q=1');
  });

  it('lets a signed-in user through the same rule', async () => {
    mockIsAuthenticatedServer.mockResolvedValue(true);
    const res = await withBridgeAuth(publicByDefault)(pageRequest('/dashboard', 'bridge_access_token=t'));

    expect(passedThrough(res)).toBe(true);
    expect(res.headers.get('location')).toBeNull();
  });

  it('answers a signed-out API request on that rule with 401 JSON', async () => {
    const res = await withBridgeAuth(publicByDefault)(apiRequest('/dashboard/data'));
    expect(res.status).toBe(401);
  });

  it('leaves public routes alone without checking the session', async () => {
    const res = await withBridgeAuth(publicByDefault)(pageRequest('/pricing'));

    expect(passedThrough(res)).toBe(true);
    expect(mockIsAuthenticatedServer).not.toHaveBeenCalled();
  });

  it('still lets a later public rule win over an earlier protected prefix match', async () => {
    const mw = withBridgeAuth({
      defaultAccess: 'public',
      rules: [
        { match: '/dashboard', public: false },
        { match: '/dashboard/help', public: true },
      ],
    });
    expect(passedThrough(await mw(pageRequest('/dashboard/help')))).toBe(true);
  });

  it("denies when the session cannot be checked (defaultAccess 'public' rule)", async () => {
    mockIsAuthenticatedServer.mockRejectedValue(new Error('token service down'));
    const res = await withBridgeAuth(publicByDefault)(pageRequest('/dashboard', 'bridge_access_token=t'));

    expect(passedThrough(res)).toBe(false);
    expect(res.status).toBe(401);
  });

  it("denies when the session cannot be checked (defaultAccess 'protected')", async () => {
    mockIsAuthenticatedServer.mockRejectedValue(new Error('token service down'));
    const res = await withBridgeAuth({})(pageRequest('/anything', 'bridge_access_token=t'));

    expect(passedThrough(res)).toBe(false);
    expect(res.status).toBe(401);
  });

  it('denies when a flag rule cannot be decided', async () => {
    mockIsAuthenticatedServer.mockRejectedValue(new Error('token service down'));
    const mw = withBridgeAuth({ rules: [{ match: '/beta', featureFlag: 'beta' }] });
    const res = await mw(pageRequest('/beta', 'bridge_access_token=t'));

    expect(passedThrough(res)).toBe(false);
    expect(res.status).toBe(401);
  });

  it('never warns about SDK auth', async () => {
    await withBridgeAuth(publicByDefault)(pageRequest('/dashboard'));
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('SDK-auth mode (loginRoute set) — tokens are in the browser, so the middleware steps aside', () => {
  beforeEach(() => {
    env[LOGIN_ROUTE_ENV] = '/auth/login';
  });

  it("does not redirect a `public: false` route to login (a signed-in SDK user would loop)", async () => {
    const res = await withBridgeAuth(publicByDefault)(pageRequest('/dashboard'));

    expect(passedThrough(res)).toBe(true);
    expect(res.headers.get('location')).toBeNull();
    expect(mockIsAuthenticatedServer).not.toHaveBeenCalled();
  });

  it("does not redirect an unmatched route under defaultAccess 'protected' either", async () => {
    const res = await withBridgeAuth({})(pageRequest('/settings'));

    expect(passedThrough(res)).toBe(true);
    expect(res.headers.get('location')).toBeNull();
  });

  it('does not 401 an API call that carries its token in the Authorization header — the API checks it', async () => {
    const res = await withBridgeAuth({})(apiRequest('/api/projects'));
    expect(passedThrough(res)).toBe(true);
  });

  it('does not bounce a flag-gated route it cannot evaluate', async () => {
    const res = await withBridgeAuth({ rules: [{ match: '/beta', featureFlag: 'beta' }] })(pageRequest('/beta'));
    expect(passedThrough(res)).toBe(true);
  });

  it('enforces where it CAN see a session: an expired Bridge cookie goes to the app login page with the deep link', async () => {
    const res = await withBridgeAuth(publicByDefault)(pageRequest('/dashboard?tab=2', 'bridge_access_token=expired'));

    const location = new URL(res.headers.get('location')!);
    expect(location.pathname).toBe('/auth/login');
    expect(location.searchParams.get(DEFAULT_RETURN_TO_PARAM)).toBe('/dashboard?tab=2');
  });

  it('warns once in development, however many requests it lets through', async () => {
    env.NODE_ENV = 'development';
    const mw = withBridgeAuth(publicByDefault);
    await mw(pageRequest('/dashboard'));
    await mw(pageRequest('/dashboard/a'));
    await mw(pageRequest('/dashboard/b'));

    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('<ProtectedRoute>');
  });

  it('never warns in production', async () => {
    env.NODE_ENV = 'production';
    const mw = withBridgeAuth(publicByDefault);
    await mw(pageRequest('/dashboard'));
    await mw(pageRequest('/dashboard/a'));

    expect(warn).not.toHaveBeenCalled();
  });

  it('the loginRoute option declares SDK-auth mode just like the env variable', async () => {
    delete env[LOGIN_ROUTE_ENV];
    // Without the option this is hosted mode and a signed-out visitor is redirected.
    const res = await withBridgeAuth({ loginRoute: '/signin' })(pageRequest('/settings'));
    expect(passedThrough(res)).toBe(true);
    expect(res.headers.get('location')).toBeNull();
  });
});
