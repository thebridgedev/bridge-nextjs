/**
 * TBP-742 — the page lists behind `app/auth/[...bridge]` and
 * `app/subscription/[[...bridge]]`, with Next's array-shaped catch-all params.
 * New on this branch (the modules did not exist on origin/main).
 */
import { bridgeAuthBase, parseBridgeAuthRoute, restSegments } from './auth-routes';
import { appUsesBilling, isPaywallExempt, parseBridgeBillingRoute, resolveBillingRoutes } from './billing-routes';
import { plansIncludingFeature, resolveUpgradeDialog, upgradeHrefFor } from './upgrade-dialog';

describe('auth routes', () => {
  it('parses every page, exact shapes only', () => {
    expect(parseBridgeAuthRoute(['login'])).toEqual({ page: 'login' });
    expect(parseBridgeAuthRoute(['oauth-callback'])).toEqual({ page: 'oauth-callback' });
    expect(parseBridgeAuthRoute(['set-password', 'tok'])).toEqual({ page: 'set-password', token: 'tok' });
    expect(parseBridgeAuthRoute(['setup-passkey', 'tok'])).toEqual({ page: 'setup-passkey', token: 'tok' });
    expect(parseBridgeAuthRoute(['set-password'])).toBeNull();
    expect(parseBridgeAuthRoute(['login', 'extra'])).toBeNull();
    expect(parseBridgeAuthRoute(['nope'])).toBeNull();
    expect(parseBridgeAuthRoute('login')).toEqual({ page: 'login' });
    expect(parseBridgeAuthRoute(undefined)).toBeNull();
  });

  it('finds the prefix the catch-all lives under', () => {
    expect(bridgeAuthBase('/auth/login', ['login'])).toBe('/auth');
    expect(bridgeAuthBase('/account/auth/set-password/a%20b', ['set-password', 'a b'])).toBe('/account/auth');
    expect(restSegments(undefined)).toEqual([]);
  });
});

describe('billing routes', () => {
  it('the bare address is the manage page (optional catch-all)', () => {
    expect(parseBridgeBillingRoute(undefined)).toEqual({ page: 'manage' });
    expect(parseBridgeBillingRoute(['plan'])).toEqual({ page: 'plan' });
    expect(parseBridgeBillingRoute(['success'])).toEqual({ page: 'success' });
    expect(parseBridgeBillingRoute(['error'])).toEqual({ page: 'error' });
    expect(parseBridgeBillingRoute(['cancel'])).toBeNull();
    expect(parseBridgeBillingRoute(['plan', 'x'])).toBeNull();
  });

  it('defaults point at pages that exist; paywallRoute: false turns the redirect off', () => {
    expect(resolveBillingRoutes(undefined)).toEqual({
      manageRoute: '/subscription',
      paywallRoute: '/subscription/plan',
      paywallIsDefault: true,
      paymentErrorRoute: '/subscription/error',
      successRoute: '/subscription/success',
    });
    const custom = resolveBillingRoutes({ paywallRoute: '/welcome', manageRoute: '/billing/' });
    expect(custom.paywallRoute).toBe('/welcome');
    expect(custom.paywallIsDefault).toBe(false);
    expect(custom.successRoute).toBe('/billing/success');
    expect(resolveBillingRoutes({ paywallRoute: false }).paywallRoute).toBeNull();
  });

  it('the default paywall only for an app with plans; the paywall and error pages are exempt', () => {
    expect(appUsesBilling([])).toBe(false);
    expect(appUsesBilling(null)).toBe(false);
    expect(appUsesBilling([{}])).toBe(true);
    const routes = resolveBillingRoutes(undefined);
    expect(isPaywallExempt('/subscription/plan', routes)).toBe(true);
    expect(isPaywallExempt('/subscription/error', routes)).toBe(true);
    expect(isPaywallExempt('/dashboard', routes)).toBe(false);
  });
});

describe('upgrade dialog helpers', () => {
  it('on unless turned off; a component replaces it', () => {
    const Mine = () => null;
    expect(resolveUpgradeDialog(undefined)).toBe('default');
    expect(resolveUpgradeDialog({ upgradeDialog: true })).toBe('default');
    expect(resolveUpgradeDialog({ upgradeDialog: false })).toBeNull();
    expect(resolveUpgradeDialog({ upgradeDialog: Mine })).toBe(Mine);
  });

  it("goes to the refusal's own fix, else the subscription page", () => {
    expect(upgradeHrefFor({ fix: '/billing?from=tickets' }, undefined)).toBe('/billing?from=tickets');
    expect(upgradeHrefFor(null, undefined)).toBe('/subscription');
    expect(upgradeHrefFor({ fix: null }, { manageRoute: '/plans' })).toBe('/plans');
  });

  it('names the plans that include a feature, cheapest first', () => {
    const plans = [
      { key: 'biz', name: 'Business', prices: [{ amount: 99 }], features: [{ key: 'sso', name: 'SSO' }] },
      { key: 'pro', name: 'Pro', prices: [{ amount: 20 }], features: [{ key: 'sso', name: 'SSO' }] },
      { key: 'free', name: 'Free', prices: [{ amount: 0 }], features: [] },
    ];
    expect(plansIncludingFeature(plans, 'sso')).toEqual(['Pro', 'Business']);
    expect(plansIncludingFeature(plans, null)).toEqual([]);
  });
});
