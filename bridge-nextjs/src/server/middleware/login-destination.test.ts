/**
 * TBP-629 follow-ups — where a signed-out page navigation is sent, with the
 * REAL config resolution (`getConfig`), which the other middleware tests mock.
 *
 * 1. Hosted mode is the default. `getConfig()` used to default `loginRoute` to
 *    `/login`, and since v0.6.0 the middleware reads a set `loginRoute` as SDK
 *    mode — so every hosted app without NEXT_PUBLIC_BRIDGE_LOGIN_ROUTE sent
 *    signed-out visitors to `/login?redirectUri=…` on its own origin instead of
 *    the hosted login page.
 * 2. A featureFlag rule's signed-out branch redirected to the hosted page bare:
 *    no return-to cookie, and an SDK-mode app's own login page was skipped.
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
      getAccessTokenServer: jest.fn().mockReturnValue(null),
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
const { withAuth } = require('./auth-middleware');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { withBridgeAuth } = require('./with-bridge-auth');

function pageRequest(path: string, cookie?: string): NextRequest {
  return new NextRequest(`http://localhost:3000${path}`, {
    headers: { accept: 'text/html,application/xhtml+xml', ...(cookie ? { cookie } : {}) },
  });
}

function stashedReturnTo(res: { cookies: { get(name: string): { value: string } | undefined } }): string | null {
  const value = res.cookies.get(RETURN_TO_COOKIE)?.value;
  return value ? decodeURIComponent(value) : null;
}

const ENV_KEY = 'NEXT_PUBLIC_BRIDGE_LOGIN_ROUTE';
let savedEnv: string | undefined;

beforeEach(() => {
  savedEnv = process.env[ENV_KEY];
  delete process.env[ENV_KEY];
  mockIsAuthenticatedServer.mockReset().mockResolvedValue(false);
});

afterEach(() => {
  if (savedEnv === undefined) delete process.env[ENV_KEY];
  else process.env[ENV_KEY] = savedEnv;
});

describe('protected route, signed out', () => {
  it('hosted mode (no login route configured) goes to the hosted page and remembers the deep link', async () => {
    const res = await withAuth({ publicPaths: [] })(pageRequest('/dashboard?x=1'));

    expect(res.headers.get('location')).toBe(HOSTED_LOGIN);
    expect(stashedReturnTo(res)).toBe('/dashboard?x=1');
  });

  it('SDK mode (NEXT_PUBLIC_BRIDGE_LOGIN_ROUTE) goes to the app login page with the deep link on the URL', async () => {
    process.env[ENV_KEY] = '/auth/login';
    const res = await withAuth({ publicPaths: [] })(pageRequest('/dashboard?x=1'));

    const location = new URL(res.headers.get('location')!);
    expect(location.origin).toBe('http://localhost:3000');
    expect(location.pathname).toBe('/auth/login');
    expect(location.searchParams.get(DEFAULT_RETURN_TO_PARAM)).toBe('/dashboard?x=1');
  });
});

describe('featureFlag route, signed out', () => {
  const rules = [{ match: '/beta', featureFlag: 'beta-feature' }];

  it('hosted mode remembers the deep link, like any protected route', async () => {
    const res = await withBridgeAuth({ rules })(pageRequest('/beta?y=2'));

    expect(res.headers.get('location')).toBe(HOSTED_LOGIN);
    expect(stashedReturnTo(res)).toBe('/beta?y=2');
  });

  it("SDK mode, with a Bridge session cookie it can check, goes to the app's own login page with the deep link", async () => {
    // Without a visible session the middleware steps aside in SDK mode (TBP-666,
    // with-bridge-auth-modes.test.ts); an expired cookie is a session it can see.
    process.env[ENV_KEY] = '/auth/login';
    const res = await withBridgeAuth({ rules })(pageRequest('/beta?y=2', 'bridge_access_token=expired'));

    const location = new URL(res.headers.get('location')!);
    expect(location.pathname).toBe('/auth/login');
    expect(location.searchParams.get(DEFAULT_RETURN_TO_PARAM)).toBe('/beta?y=2');
  });
});
