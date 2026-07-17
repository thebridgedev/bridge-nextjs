import { NextRequest } from 'next/server';

/**
 * TBP-473 — unauthenticated denial semantics for the default-protected path.
 *
 *   - unauthenticated API route  → 401 JSON (no redirect)
 *   - unauthenticated page route → redirect to login
 */

const mockIsAuthenticatedServer = jest.fn();
const mockGetAccessTokenServer = jest.fn();
const mockCreateLoginUrl = jest.fn().mockReturnValue('https://login.example/login');
const mockRefreshTokenIfNeeded = jest.fn().mockResolvedValue(false);

jest.mock('../utils/init-services', () => ({
  initServices: jest.fn().mockImplementation(async () => ({
    config: { debug: false },
    tokenService: {
      isAuthenticatedServer: mockIsAuthenticatedServer,
      getAccessTokenServer: mockGetAccessTokenServer,
      getTokenExpiryTime: jest.fn().mockReturnValue(null),
      formatTimeUntilExpiry: jest.fn().mockReturnValue(''),
      refreshTokenIfNeeded: mockRefreshTokenIfNeeded,
    },
    authService: {
      createLoginUrl: mockCreateLoginUrl,
    },
  })),
}));

jest.mock('../utils/get-config', () => ({
  getConfig: jest.fn().mockReturnValue({ debug: false }),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { withAuth } = require('./auth-middleware');

function pageRequest(path: string): NextRequest {
  return new NextRequest(`http://localhost:3000${path}`, {
    headers: { accept: 'text/html,application/xhtml+xml' },
  });
}

function apiRequest(path: string): NextRequest {
  return new NextRequest(`http://localhost:3000${path}`, {
    headers: { accept: 'application/json' },
  });
}

beforeEach(() => {
  mockIsAuthenticatedServer.mockReset();
  mockGetAccessTokenServer.mockReset();
});

describe('withAuth — unauthenticated denial', () => {
  it('returns 401 JSON for an unauthenticated API route', async () => {
    mockIsAuthenticatedServer.mockResolvedValue(false);
    const mw = withAuth({ publicPaths: [] });
    const res = await mw(apiRequest('/api/private'));

    expect(res.status).toBe(401);
    expect(res.headers.get('location')).toBeNull();
    const body = await res.json();
    expect(body.error).toBe('Unauthorized');
  });

  it('redirects to login for an unauthenticated page route', async () => {
    mockIsAuthenticatedServer.mockResolvedValue(false);
    const mw = withAuth({ publicPaths: [] });
    const res = await mw(pageRequest('/dashboard'));

    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.status).toBeLessThan(400);
    expect(res.headers.get('location')).toBe('https://login.example/login');
  });

  it('returns 401 JSON when authenticated but the access token is missing on an API route', async () => {
    mockIsAuthenticatedServer.mockResolvedValue(true);
    mockGetAccessTokenServer.mockReturnValue(null);
    const mw = withAuth({ publicPaths: [] });
    const res = await mw(apiRequest('/api/private'));

    expect(res.status).toBe(401);
  });

  it('allows an authenticated request through with a valid token', async () => {
    mockIsAuthenticatedServer.mockResolvedValue(true);
    mockGetAccessTokenServer.mockReturnValue('valid-token');
    const mw = withAuth({ publicPaths: [] });
    const res = await mw(pageRequest('/dashboard'));

    expect(res.status).toBe(200);
    expect(res.headers.get('location')).toBeNull();
  });
});
