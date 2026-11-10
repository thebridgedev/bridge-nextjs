/**
 * @jest-environment jsdom
 *
 * TBP-946 (port of bridge-svelte TBP-813) — the checkout landing is part of the
 * public client API: the banner, the read-only signal, and a hook. Only the
 * plugin marks a checkout complete, so that stays private.
 */
jest.mock(
  'next/navigation',
  () => ({
    useParams: () => ({}),
    usePathname: () => '/',
    useRouter: () => ({ push: jest.fn(), replace: jest.fn(), refresh: jest.fn() }),
    notFound: () => {
      throw new Error('NEXT_NOT_FOUND');
    },
  }),
  { virtual: true },
);

// eslint-disable-next-line @typescript-eslint/no-var-requires
const pkg = require('./client') as Record<string, unknown>;

describe('client exports — TBP-946', () => {
  it('exports BridgeCheckoutNotice, checkoutResult, takeCheckoutResult, clearCheckoutResult and useCheckoutResult', () => {
    expect(typeof pkg.BridgeCheckoutNotice).toBe('function');
    expect(typeof (pkg.checkoutResult as { subscribe: unknown }).subscribe).toBe('function');
    expect(typeof pkg.takeCheckoutResult).toBe('function');
    expect(typeof pkg.clearCheckoutResult).toBe('function');
    expect(typeof pkg.useCheckoutResult).toBe('function');
  });

  it('apps read the signal; only the plugin marks it', () => {
    expect(pkg.markCheckoutComplete).toBeUndefined();
  });

  it('keeps every existing subscription export', () => {
    for (const name of ['PlanSelector', 'BridgeBillingRoutes', 'BridgePaywallPage', 'BillingPortalButton', 'resolveBillingRoutes']) {
      expect(typeof pkg[name]).toBe('function');
    }
  });
});
