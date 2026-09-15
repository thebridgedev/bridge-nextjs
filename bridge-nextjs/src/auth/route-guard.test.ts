/**
 * TBP-654 — `createRouteGuard` never trusts a verdict that was in flight
 * while the route-guard cache was invalidated.
 *
 * The race: a Free user's flag check is in flight when the upgrade lands. The
 * runtime drops the cache, then the stale check resolves — writing its "denied"
 * back into auth-core's cache with a fresh timestamp. Without the generation
 * check the wrapper returns that verdict and the cache keeps it for 5 minutes.
 */

type Deferred<T> = { promise: Promise<T>; resolve: (v: T) => void };
function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

const mockInvalidateFeatureFlagCache = jest.fn();
const mockCheckRouteRestrictions = jest.fn<Promise<string | null>, [string]>();
const mockShouldRedirectToLogin = jest.fn<boolean, [string]>().mockReturnValue(false);

const mockIsAuthenticated = jest.fn<boolean, []>(() => false);
const mockIsPublicRoute = jest.fn<boolean, [string]>(() => false);

jest.mock('../core/bridge-instance', () => ({
  getBridgeAuth: () => ({
    invalidateFeatureFlagCache: mockInvalidateFeatureFlagCache,
    isAuthenticated: () => mockIsAuthenticated(),
    createRouteGuard: () => ({
      isPublicRoute: (p: string) => mockIsPublicRoute(p),
      isProtectedRoute: () => true,
      shouldRedirectToLogin: mockShouldRedirectToLogin,
      checkRouteRestrictions: mockCheckRouteRestrictions,
      getLoginRedirect: () => 'https://login.example/login',
      getNavigationDecision: jest.fn(),
      resolveReturnTo: (p: string) => p,
    }),
  }),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createRouteGuard } = require('./route-guard');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { invalidateRouteGuardCache } = require('./guard-cache');

/** Let microtasks run until the first restriction check has actually started. */
async function untilCheckInFlight(): Promise<void> {
  for (let i = 0; i < 50 && mockCheckRouteRestrictions.mock.calls.length === 0; i++) {
    await Promise.resolve();
  }
  expect(mockCheckRouteRestrictions).toHaveBeenCalledTimes(1);
}

const config = { rules: [{ match: '/pro', featureFlag: 'pro-page', redirectTo: '/upgrade' }], defaultAccess: 'protected' };

beforeEach(() => {
  mockInvalidateFeatureFlagCache.mockReset();
  mockCheckRouteRestrictions.mockReset();
  mockShouldRedirectToLogin.mockReset().mockReturnValue(false);
});

describe('createRouteGuard — stale in-flight verdicts (TBP-654)', () => {
  it('discards a verdict that was in flight across an invalidation and asks again', async () => {
    const stale = deferred<string | null>();
    mockCheckRouteRestrictions.mockReturnValueOnce(stale.promise).mockResolvedValueOnce(null);

    const decision = createRouteGuard(config).getNavigationDecision('/pro');
    await untilCheckInFlight();
    invalidateRouteGuardCache(); // the upgrade lands mid-check
    stale.resolve('/upgrade'); // the Free-plan answer arrives afterwards

    await expect(decision).resolves.toEqual({ type: 'allow' });
    expect(mockCheckRouteRestrictions).toHaveBeenCalledTimes(2);
    // Once for the invalidation, once more to drop what the stale read wrote back.
    expect(mockInvalidateFeatureFlagCache).toHaveBeenCalledTimes(2);
  });

  it('checkRouteRestrictions gets the same protection, with or without flagsReady', async () => {
    const stale = deferred<string | null>();
    mockCheckRouteRestrictions.mockReturnValueOnce(stale.promise).mockResolvedValueOnce(null);

    const result = createRouteGuard(config, Promise.resolve()).checkRouteRestrictions('/pro');
    await untilCheckInFlight();
    invalidateRouteGuardCache();
    stale.resolve('/upgrade');

    await expect(result).resolves.toBeNull();
  });

  it('reads once when nothing changed underneath it', async () => {
    mockCheckRouteRestrictions.mockResolvedValueOnce('/upgrade');

    await expect(createRouteGuard(config).getNavigationDecision('/pro')).resolves.toEqual({
      type: 'redirect',
      to: '/upgrade',
    });
    expect(mockCheckRouteRestrictions).toHaveBeenCalledTimes(1);
    expect(mockInvalidateFeatureFlagCache).not.toHaveBeenCalled();
  });

  it('gives up re-reading after a bounded number of attempts', async () => {
    mockCheckRouteRestrictions.mockImplementation(async () => {
      invalidateRouteGuardCache(); // every read is overtaken by another change
      return '/upgrade';
    });

    await expect(createRouteGuard(config).getNavigationDecision('/pro')).resolves.toEqual({
      type: 'redirect',
      to: '/upgrade',
    });
    expect(mockCheckRouteRestrictions).toHaveBeenCalledTimes(3);
  });
});

describe('createRouteGuard — fails closed when it cannot decide (TBP-653)', () => {
  const rules = {
    rules: [
      { match: '/pro', featureFlag: 'pro-page', redirectTo: '/upgrade' },
      { match: '/about', public: true },
    ],
    defaultAccess: 'protected',
  };

  beforeEach(() => {
    mockIsAuthenticated.mockReset().mockReturnValue(false);
    mockIsPublicRoute.mockReset().mockReturnValue(false);
  });

  it('a signed-out visitor goes to login, carrying the attempted target', async () => {
    mockShouldRedirectToLogin.mockImplementation(() => {
      throw new Error('malformed config');
    });

    await expect(createRouteGuard(rules).getNavigationDecision('/pro', '/pro?x=1')).resolves.toEqual({
      type: 'login',
      loginUrl: 'https://login.example/login',
      returnTo: '/pro?x=1',
    });
  });

  it('a signed-in user whose flag check throws gets the rule redirect, never allow', async () => {
    mockIsAuthenticated.mockReturnValue(true);
    mockCheckRouteRestrictions.mockRejectedValue(new Error('network down'));

    await expect(createRouteGuard(rules).getNavigationDecision('/pro')).resolves.toEqual({
      type: 'redirect',
      to: '/upgrade',
    });
  });

  it('a public route with no requirement stays reachable', async () => {
    mockIsPublicRoute.mockReturnValue(true);
    mockCheckRouteRestrictions.mockRejectedValue(new Error('network down'));

    await expect(createRouteGuard(rules).getNavigationDecision('/about')).resolves.toEqual({ type: 'allow' });
  });

  it('a public route that also carries a flag requirement is still denied', async () => {
    mockIsPublicRoute.mockReturnValue(true);
    mockIsAuthenticated.mockReturnValue(true);
    mockCheckRouteRestrictions.mockRejectedValue(new Error('network down'));
    const publicButFlagged = {
      rules: [{ match: '/pro', public: true, featureFlag: 'pro-page', redirectTo: '/upgrade' }],
      defaultAccess: 'protected',
    };

    await expect(createRouteGuard(publicButFlagged).getNavigationDecision('/pro')).resolves.toEqual({
      type: 'redirect',
      to: '/upgrade',
    });
  });
});
