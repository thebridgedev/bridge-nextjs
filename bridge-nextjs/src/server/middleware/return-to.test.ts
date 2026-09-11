import { NextRequest } from 'next/server';

/**
 * TBP-629 — deep-link preservation across the server-side login redirect.
 *
 * Next.js is the one package that cannot use the browser mechanism. `withAuth`
 * runs in middleware and `createBridgeCallbackRoute` is a route handler, so
 * neither end of the hosted round-trip has a DOM and `sessionStorage` is not
 * available to either. A cookie is the only storage both halves can see, which
 * is why these tests exist as their own file rather than mirroring react's.
 *
 * The bug being guarded against is silent: sign in from a deep link, land on
 * the default route, no error anywhere.
 */

const mockIsAuthenticatedServer = jest.fn();
const mockGetAccessTokenServer = jest.fn();
const mockCreateLoginUrl = jest.fn().mockReturnValue('https://login.example/login?app=x');
const mockRefreshTokenIfNeeded = jest.fn().mockResolvedValue(false);

let mockCurrentConfig: Record<string, unknown> = { debug: false };

jest.mock('../utils/init-services', () => ({
  initServices: jest.fn().mockImplementation(async () => ({
    config: mockCurrentConfig,
    tokenService: {
      isAuthenticatedServer: mockIsAuthenticatedServer,
      getAccessTokenServer: mockGetAccessTokenServer,
      getTokenExpiryTime: jest.fn().mockReturnValue(null),
      formatTimeUntilExpiry: jest.fn().mockReturnValue(''),
      refreshTokenIfNeeded: mockRefreshTokenIfNeeded,
    },
    authService: { createLoginUrl: mockCreateLoginUrl },
  })),
}));

jest.mock('../utils/get-config', () => ({
  getConfig: jest.fn().mockImplementation(() => mockCurrentConfig),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { withAuth } = require('./auth-middleware');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { RETURN_TO_COOKIE } = require('../utils/return-to');

function pageRequest(path: string): NextRequest {
  return new NextRequest(`http://localhost:3000${path}`, {
    headers: { accept: 'text/html,application/xhtml+xml' },
  });
}

async function denyAndInspect(path: string, config: Record<string, unknown>) {
  mockCurrentConfig = { debug: false, ...config };
  mockIsAuthenticatedServer.mockResolvedValue(false);
  const res = await withAuth({ publicPaths: [] })(pageRequest(path));
  return {
    location: res.headers.get('location'),
    cookie: res.cookies.get(RETURN_TO_COOKIE)?.value ?? null,
  };
}

beforeEach(() => {
  mockIsAuthenticatedServer.mockReset();
  mockGetAccessTokenServer.mockReset();
  mockCurrentConfig = { debug: false };
});

describe('SDK mode — the target rides on the app’s own login route', () => {
  it('carries path and query', async () => {
    const { location, cookie } = await denyAndInspect('/incident/42?tab=files', {
      loginRoute: '/auth/login',
    });

    expect(location).toContain('/auth/login?redirectUri=');
    expect(decodeURIComponent(location!.split('redirectUri=')[1])).toBe('/incident/42?tab=files');
    // Already on the URL; a cookie as well would be a second source of truth.
    expect(cookie).toBeNull();
  });

  it('does not send the login route back to itself', async () => {
    const { location } = await denyAndInspect('/auth/login', { loginRoute: '/auth/login' });
    expect(location).toBe('http://localhost:3000/auth/login');
  });

  it('keeps today’s behaviour exactly when opted out', async () => {
    const { location, cookie } = await denyAndInspect('/incident/42', {
      loginRoute: '/auth/login',
      returnTo: { enabled: false },
    });
    expect(location).toBe('http://localhost:3000/auth/login');
    expect(cookie).toBeNull();
  });

  it('respects a custom parameter name', async () => {
    const { location } = await denyAndInspect('/incident/42', {
      loginRoute: '/auth/login',
      returnTo: { param: 'next' },
    });
    expect(location).toContain('next=%2Fincident%2F42');
  });
});

describe('hosted mode — the target goes in a cookie, never on the OAuth URL', () => {
  it('stashes the target and leaves the login URL byte-for-byte untouched', async () => {
    const { location, cookie } = await denyAndInspect('/incident/42?tab=files', {});

    // The load-bearing assertion. bridge-api validates `redirect_uri` with an
    // exact `allowedRedirectUris.includes()` match, so appending anything here
    // breaks login outright rather than improving it.
    expect(location).toBe('https://login.example/login?app=x');
    expect(cookie).toBe('/incident/42?tab=files');
  });

  it('stashes nothing when opted out', async () => {
    const { cookie } = await denyAndInspect('/incident/42', { returnTo: { enabled: false } });
    expect(cookie).toBeNull();
  });

  it('sets the cookie so it survives the return trip from the identity provider', async () => {
    mockCurrentConfig = { debug: false };
    mockIsAuthenticatedServer.mockResolvedValue(false);
    const res = await withAuth({ publicPaths: [] })(pageRequest('/incident/42'));
    const c = res.cookies.get(RETURN_TO_COOKIE)!;

    // sameSite 'strict' would DROP the cookie on the top-level GET navigation
    // back from the provider — the one request it exists to survive.
    expect(c.sameSite).toBe('lax');
    // Nothing in the browser needs to read it, so nothing should be able to.
    expect(c.httpOnly).toBe(true);
    // In-flight state for a login happening now. A stale value would hijack a
    // later login in the same browser.
    expect(c.maxAge).toBeLessThanOrEqual(600);
    expect(c.maxAge).toBeGreaterThan(0);
  });
});

describe('hostile targets never reach a redirect', () => {
  // In SDK mode the value ends up on a URL the login page reads back, so it is
  // untrusted the moment it leaves here.
  it('refuses a path that is not same-origin-absolute', async () => {
    // A request path is always absolute, so the realistic attack is a crafted
    // path that normalises to something else; sanitizeReturnTo rejects the
    // backslash forms outright rather than repairing them.
    const { location } = await denyAndInspect('/\\evil.test', { loginRoute: '/auth/login' });
    expect(location).not.toContain('evil.test');
  });
});
