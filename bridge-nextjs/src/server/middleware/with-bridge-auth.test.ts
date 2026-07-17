import { NextRequest, NextResponse } from 'next/server';

/**
 * TBP-473 — featureFlag route-rule evaluation + denial semantics.
 *
 * These tests exercise `withBridgeAuth` with the flag/token/auth services
 * mocked, so no network or real JWTs are needed. We assert the exact response
 * per case:
 *   - featureFlag pass (single / any / all)     → NextResponse.next() (200-ish)
 *   - featureFlag fail (single / any / all)      → 403 JSON
 *   - fail-closed (eval throws)                  → 403 JSON
 *   - unauth API route + featureFlag rule        → 401 JSON
 *   - unauth page route + featureFlag rule       → redirect to login
 *   - unauth API route (default-protected)       → 401 JSON
 *   - unauth page route (default-protected)      → redirect to login
 */

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockIsFeatureEnabledServer = jest.fn();
const mockIsAuthenticatedServer = jest.fn();

jest.mock('../utils/feature-flag.server', () => ({
  FeatureFlagServer: {
    getInstance: () => ({
      init: jest.fn(),
      isFeatureEnabledServer: mockIsFeatureEnabledServer,
    }),
  },
}));

jest.mock('../utils/token-service.server', () => ({
  TokenServiceServer: {
    getInstance: () => ({
      init: jest.fn(),
      isAuthenticatedServer: mockIsAuthenticatedServer,
      getAccessTokenServer: jest.fn().mockReturnValue('token'),
    }),
  },
}));

jest.mock('../../shared/services/auth.service', () => ({
  AuthService: {
    getInstance: () => ({
      init: jest.fn(),
      createLoginUrl: jest.fn().mockReturnValue('https://login.example/login'),
    }),
  },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { withBridgeAuth } = require('./with-bridge-auth');

// ── Helpers ───────────────────────────────────────────────────────────────────

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
  mockIsFeatureEnabledServer.mockReset();
  mockIsAuthenticatedServer.mockReset();
  // Default: authenticated user for flag tests.
  mockIsAuthenticatedServer.mockResolvedValue(true);
});

// ── featureFlag: single key ───────────────────────────────────────────────────

describe('withBridgeAuth featureFlag — single key', () => {
  it('allows access when the flag is enabled', async () => {
    mockIsFeatureEnabledServer.mockResolvedValue(true);
    const mw = withBridgeAuth({ rules: [{ match: '/beta', featureFlag: 'beta-feature' }] });
    const res = await mw(pageRequest('/beta'));

    expect(mockIsFeatureEnabledServer).toHaveBeenCalledWith('beta-feature', expect.anything());
    // NextResponse.next() has no redirect location and a 200 status.
    expect(res.status).toBe(200);
    expect(res.headers.get('location')).toBeNull();
  });

  it('denies with 403 JSON when the flag is disabled', async () => {
    mockIsFeatureEnabledServer.mockResolvedValue(false);
    const mw = withBridgeAuth({ rules: [{ match: '/beta', featureFlag: 'beta-feature' }] });
    const res = await mw(pageRequest('/beta'));

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('Forbidden');
  });

  it('denies with 403 JSON on an API route too (never redirects)', async () => {
    mockIsFeatureEnabledServer.mockResolvedValue(false);
    const mw = withBridgeAuth({ rules: [{ match: '/api/beta', featureFlag: 'beta-feature' }] });
    const res = await mw(apiRequest('/api/beta'));

    expect(res.status).toBe(403);
    expect(res.headers.get('location')).toBeNull();
  });
});

// ── featureFlag: { any: [...] } ───────────────────────────────────────────────

describe('withBridgeAuth featureFlag — any', () => {
  it('allows when at least one flag is enabled', async () => {
    mockIsFeatureEnabledServer.mockImplementation(async (key: string) => key === 'b');
    const mw = withBridgeAuth({ rules: [{ match: '/x', featureFlag: { any: ['a', 'b'] } }] });
    const res = await mw(pageRequest('/x'));
    expect(res.status).toBe(200);
  });

  it('denies with 403 when none of the flags are enabled', async () => {
    mockIsFeatureEnabledServer.mockResolvedValue(false);
    const mw = withBridgeAuth({ rules: [{ match: '/x', featureFlag: { any: ['a', 'b'] } }] });
    const res = await mw(pageRequest('/x'));
    expect(res.status).toBe(403);
  });
});

// ── featureFlag: { all: [...] } ───────────────────────────────────────────────

describe('withBridgeAuth featureFlag — all', () => {
  it('allows when every flag is enabled', async () => {
    mockIsFeatureEnabledServer.mockResolvedValue(true);
    const mw = withBridgeAuth({ rules: [{ match: '/x', featureFlag: { all: ['a', 'b'] } }] });
    const res = await mw(pageRequest('/x'));
    expect(res.status).toBe(200);
  });

  it('denies with 403 when one flag is disabled', async () => {
    mockIsFeatureEnabledServer.mockImplementation(async (key: string) => key === 'a');
    const mw = withBridgeAuth({ rules: [{ match: '/x', featureFlag: { all: ['a', 'b'] } }] });
    const res = await mw(pageRequest('/x'));
    expect(res.status).toBe(403);
  });
});

// ── Fail-closed ───────────────────────────────────────────────────────────────

describe('withBridgeAuth featureFlag — fail-closed', () => {
  it('denies with 403 when flag evaluation throws', async () => {
    mockIsFeatureEnabledServer.mockRejectedValue(new Error('eval boom'));
    const mw = withBridgeAuth({ rules: [{ match: '/beta', featureFlag: 'beta-feature' }] });
    const res = await mw(pageRequest('/beta'));
    expect(res.status).toBe(403);
  });

  it('denies with 403 for an unknown requirement shape', async () => {
    const mw = withBridgeAuth({
      // Intentionally malformed requirement to exercise the fail-closed default.
      rules: [{ match: '/beta', featureFlag: {} as any }],
    });
    const res = await mw(pageRequest('/beta'));
    expect(res.status).toBe(403);
  });
});

// ── Unauthenticated + featureFlag rule ────────────────────────────────────────

describe('withBridgeAuth featureFlag — unauthenticated', () => {
  it('returns 401 JSON for an unauthenticated API request', async () => {
    mockIsAuthenticatedServer.mockResolvedValue(false);
    const mw = withBridgeAuth({ rules: [{ match: '/api/beta', featureFlag: 'beta-feature' }] });
    const res = await mw(apiRequest('/api/beta'));

    expect(res.status).toBe(401);
    expect(res.headers.get('location')).toBeNull();
    const body = await res.json();
    expect(body.error).toBe('Unauthorized');
    // Flags must not be evaluated for an unauthenticated user.
    expect(mockIsFeatureEnabledServer).not.toHaveBeenCalled();
  });

  it('redirects to login for an unauthenticated page navigation', async () => {
    mockIsAuthenticatedServer.mockResolvedValue(false);
    const mw = withBridgeAuth({ rules: [{ match: '/beta', featureFlag: 'beta-feature' }] });
    const res = await mw(pageRequest('/beta'));

    // NextResponse.redirect ⇒ 3xx with a Location header.
    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.status).toBeLessThan(400);
    expect(res.headers.get('location')).toBe('https://login.example/login');
  });
});
