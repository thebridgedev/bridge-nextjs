/**
 * @jest-environment jsdom
 *
 * TBP-946 (port of bridge-svelte TBP-813) — the subscription page redesign,
 * rendered: the plan card (price block, "Choose / Upgrade to / Switch to",
 * the current plan flagged), the current-plan summary, and the landing after a
 * checkout or a Free pick (the subscription page with a one-time banner).
 *
 * Revert-proof: on origin/main the buttons read "Select free plan" and
 * "29 USD / month", a checkout lands on /subscription/success, and neither
 * <BridgeCheckoutNotice> nor the checkout signal exists.
 */
import * as React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useBridge as useBillingBridge } from '@nebulr-group/bridge-auth-core';

const mockNav = {
  params: {} as Record<string, string | string[] | undefined>,
  pathname: '/',
  push: jest.fn(),
  replace: jest.fn(),
};
jest.mock(
  'next/navigation',
  () => ({
    useParams: () => mockNav.params,
    usePathname: () => mockNav.pathname,
    useRouter: () => ({ push: mockNav.push, replace: mockNav.replace, refresh: jest.fn() }),
    notFound: () => {
      throw new Error('NEXT_NOT_FOUND');
    },
  }),
  { virtual: true },
);

/* eslint-disable @typescript-eslint/no-var-requires */
const { BridgeBillingRoutes } = require('./BridgeBillingRoutes');
const { BridgeCheckoutNotice } = require('./BridgeCheckoutNotice');
const { PlanSelector } = require('./PlanSelector');
const { BridgeProvider } = require('../../providers/bridge-provider');
const { checkoutResult, clearCheckoutResult, markCheckoutComplete } = require('../../checkout-result');
const { _resetBridgeInstance, getBridgeAuth, initBridge, useBridgeStore } = require('../../../core/bridge-instance');
const { __resetBridgeRuntime } = require('../../../core/bridge-runtime');
/* eslint-enable @typescript-eslint/no-var-requires */

const act = (React as unknown as { act: (cb: () => Promise<void> | void) => Promise<void> }).act;
const g = globalThis as unknown as Record<string, unknown>;

class FakeWebSocket {
  readyState = 0;
  constructor(public readonly url: string) {}
  send(): void {}
  close(): void {}
  addEventListener(): void {}
  removeEventListener(): void {}
}

const price = (id: string, amount: number, recurrenceInterval = 'month') => ({ id, amount, currency: 'usd', recurrenceInterval });
// Deliberately not cheapest-first, as the API returns them.
const PLANS = [
  { key: 'team', name: 'Team', prices: [price('t', 99)] },
  {
    key: 'pro',
    name: 'Pro',
    description: 'For growing teams.',
    prices: [price('p', 29)],
    features: [
      { key: 'analytics', name: 'Analytics' },
      { key: 'sso', name: 'Single sign-on' },
    ],
  },
  { key: 'free', name: 'Free', prices: [price('f', 0)] },
];

let container: HTMLElement;
let root: Root | null = null;
const realWarn = console.warn;
const realError = console.error;
const realInfo = console.info;

beforeAll(() => {
  g.IS_REACT_ACT_ENVIRONMENT = true;
  g.fetch = () => Promise.reject(new Error('offline (unit test)'));
  g.WebSocket = FakeWebSocket;
  console.warn = () => {};
  console.info = () => {};
  // jsdom logs "Not implemented: navigation" when a test leaves for Stripe.
  console.error = () => {};
});
afterAll(() => {
  console.warn = realWarn;
  console.error = realError;
  console.info = realInfo;
});

function resetBillingState(): void {
  const sub = useBillingBridge().subscription as unknown as { _state: unknown; _notify?: () => void };
  sub._state = null;
  sub._notify?.();
}

beforeEach(() => {
  _resetBridgeInstance();
  clearCheckoutResult();
  resetBillingState();
  mockNav.params = {};
  mockNav.pathname = '/';
  mockNav.push.mockReset();
  mockNav.replace.mockReset();
});

afterEach(async () => {
  const current = root;
  root = null;
  if (current) await act(async () => current.unmount());
  container?.remove();
  __resetBridgeRuntime?.();
  _resetBridgeInstance();
  clearCheckoutResult();
  window.history.replaceState({}, '', '/');
  sessionStorage.clear();
});

async function mount(element: React.ReactElement): Promise<void> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(element);
  });
}

/** Unmount, run `between` with nothing mounted, then mount `element` fresh. */
async function remount(between: () => void, element: React.ReactElement): Promise<void> {
  await act(async () => root!.unmount());
  between();
  root = createRoot(container);
  await act(async () => root!.render(element));
}

async function settle(ms = 20): Promise<void> {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
}

/** Signed in, with a subscription and plans already in the store. */
function signedIn(status: Record<string, unknown> | null, billing?: Record<string, unknown>): void {
  initBridge({ appId: 'app-1', apiBaseUrl: 'http://127.0.0.1:1', loginRoute: '/auth/login', billing });
  useBridgeStore.setState({
    tokens: { accessToken: 'at' } as never,
    subscription: { status: status as never, plans: PLANS as never, loading: false, error: null },
  });
}

function card(name: string): HTMLElement {
  const found = [...container.querySelectorAll<HTMLElement>('[data-bridge-plan-card]')].find(
    (c) => c.querySelector('.bridge-plan-name')?.textContent === name,
  );
  if (!found) throw new Error(`no card for ${name}`);
  return found;
}

const buttonOf = (name: string) => card(name).querySelector<HTMLButtonElement>('.bridge-plan-select-btn')!;

describe('<PlanSelector> default card — TBP-946', () => {
  it('with no current plan, every button is "Choose X" and no card is flagged', async () => {
    signedIn({ shouldSelectPlan: true });
    await mount(<PlanSelector />);
    expect(buttonOf('Free').textContent).toBe('Choose Free');
    expect(buttonOf('Pro').textContent).toBe('Choose Pro');
    expect(buttonOf('Team').textContent).toBe('Choose Team');
    expect(card('Pro').getAttribute('data-pick')).toBe('choose');
    expect(container.querySelector('[data-bridge-plan-current-flag]')).toBeNull();
    // The old labels are gone.
    expect(container.textContent).not.toContain('Select free plan');
    expect(container.textContent).not.toContain('Select plan');
    expect(container.textContent).not.toContain('29 USD / month');
  });

  it('relative to the current plan: Current plan / Upgrade to / Switch to', async () => {
    signedIn({ plan: 'pro', paymentsEnabled: false });
    await mount(<PlanSelector />);

    const pro = card('Pro');
    expect(buttonOf('Pro').textContent).toBe('Current plan');
    expect(buttonOf('Pro').disabled).toBe(true);
    expect(pro.getAttribute('data-current')).toBe('true');
    expect(pro.getAttribute('data-pick')).toBe('current');
    expect(pro.querySelector('[data-bridge-plan-current-flag]')?.textContent).toBe('Your plan');

    expect(buttonOf('Team').textContent).toBe('Upgrade to Team');
    expect(card('Team').getAttribute('data-pick')).toBe('upgrade');
    expect(buttonOf('Team').className).toContain('bridge-btn-primary');
    expect(card('Team').querySelector('[data-bridge-plan-current-flag]')).toBeNull();

    expect(buttonOf('Free').textContent).toBe('Switch to Free');
    expect(card('Free').getAttribute('data-pick')).toBe('switch');
    expect(buttonOf('Free').className).toContain('bridge-btn-secondary');
  });

  it('reads a current plan given as an object, as the REST status returns it', async () => {
    signedIn({ plan: { key: 'team', name: 'Team' } });
    await mount(<PlanSelector />);
    expect(buttonOf('Team').textContent).toBe('Current plan');
    expect(buttonOf('Pro').textContent).toBe('Switch to Pro');
  });

  it('each card shows its price as a formatted amount and interval, cheapest first', async () => {
    signedIn({ shouldSelectPlan: true });
    await mount(<PlanSelector />);
    const block = card('Pro').querySelector('[data-bridge-plan-price]')!;
    expect(block.querySelector('.bridge-plan-price-amount')?.textContent).toBe('$29');
    expect(block.querySelector('.bridge-plan-price-interval')?.textContent).toBe('/ month');
    expect(card('Free').querySelector('.bridge-plan-price-amount')?.textContent).toBe('$0');
    const names = [...container.querySelectorAll('.bridge-plan-name')].map((n) => n.textContent);
    expect(names).toEqual(['Free', 'Pro', 'Team']);
  });

  it('lists each plan’s features with a check mark', async () => {
    signedIn({ shouldSelectPlan: true });
    await mount(<PlanSelector />);
    const list = card('Pro').querySelector('[data-bridge-plan-features]')!;
    expect(list.getAttribute('aria-label')).toBe('Included in Pro');
    const items = [...list.querySelectorAll('li')];
    expect(items.map((li) => li.getAttribute('data-feature'))).toEqual(['analytics', 'sso']);
    expect(items[0].querySelector('svg.bridge-plan-feature-check')).not.toBeNull();
    expect(items[0].querySelector('span')?.textContent).toBe('Analytics');
    expect(card('Free').querySelector('[data-bridge-plan-features]')).toBeNull();
  });

  it('a heading renders above the plans only when given', async () => {
    signedIn({ shouldSelectPlan: true });
    await mount(<PlanSelector />);
    expect(container.querySelector('[data-bridge-plan-head]')).toBeNull();
    await act(async () => root!.render(<PlanSelector heading="Change plan" />));
    expect(container.querySelector('h2.bridge-plan-heading')?.textContent).toBe('Change plan');
  });

  it('with monthly and yearly prices, a switch picks one; yearly by default', async () => {
    initBridge({ appId: 'app-1', apiBaseUrl: 'http://127.0.0.1:1' });
    useBridgeStore.setState({
      tokens: { accessToken: 'at' } as never,
      subscription: {
        status: { shouldSelectPlan: true } as never,
        plans: [
          { key: 'free', name: 'Free', prices: [price('f', 0)] },
          { key: 'pro', name: 'Pro', prices: [price('pm', 29), price('py', 290, 'year')] },
        ] as never,
        loading: false,
        error: null,
      },
    });
    await mount(<PlanSelector heading="Change plan" />);
    const tabs = [...container.querySelectorAll<HTMLButtonElement>('[data-bridge-plan-head] .bridge-plan-interval-tab')];
    expect(tabs.map((t) => t.textContent)).toEqual(['Monthly', 'Yearly']);
    expect(card('Pro').querySelector('.bridge-plan-price-amount')?.textContent).toBe('$290');
    expect(card('Pro').querySelectorAll('.bridge-plan-select-btn')).toHaveLength(1);
    // A free plan stays pickable under every interval.
    expect(buttonOf('Free').textContent).toBe('Choose Free');
    await act(async () => tabs[0].click());
    expect(card('Pro').querySelector('.bridge-plan-price-amount')?.textContent).toBe('$29');
    expect(card('Pro').querySelector('.bridge-plan-price-interval')?.textContent).toBe('/ month');
  });
});

describe('<PlanSelector> closes the TBP-762 / TBP-33 gaps with bridge-svelte — TBP-946', () => {
  it('a workspace that already pays is asked "Change plan?" first; confirming switches and says so in place', async () => {
    signedIn({ plan: 'pro', paymentsEnabled: true });
    const auth = getBridgeAuth();
    const changePlan = jest.spyOn(auth, 'changePlan').mockResolvedValue(undefined as never);
    jest.spyOn(auth, 'getSubscriptionStatus').mockResolvedValue({ plan: { key: 'team', name: 'Team' }, paymentsEnabled: true } as never);
    jest.spyOn(auth, 'getPlans').mockResolvedValue(PLANS as never);
    await mount(<PlanSelector />);

    await act(async () => buttonOf('Team').click());
    const dialog = container.querySelector('[data-bridge-plan-confirm]')!;
    expect(dialog.getAttribute('role')).toBe('dialog');
    expect(dialog.querySelector('.bridge-plan-confirm-title')?.textContent).toBe('Change plan?');
    expect(dialog.querySelector('.bridge-plan-confirm-body')?.textContent).toBe('Switch from Pro to Team ($99 / month).');
    expect(changePlan).not.toHaveBeenCalled();

    await act(async () => dialog.querySelector<HTMLButtonElement>('[data-bridge-plan-confirm-btn]')!.click());
    await settle();
    expect(changePlan).toHaveBeenCalledWith('team', expect.objectContaining({ amount: 99 }));
    expect(container.querySelector('[data-bridge-plan-confirm]')).toBeNull();
    expect(container.querySelector('[data-bridge-plan-success]')?.textContent).toBe("You're now on Team ($99 / month).");
    expect(buttonOf('Team').textContent).toBe('Current plan');
    expect(mockNav.push).not.toHaveBeenCalled();
  });

  it('Cancel closes the dialog without changing anything; a failure shows inside it', async () => {
    signedIn({ plan: 'pro', paymentsEnabled: true });
    const changePlan = jest.spyOn(getBridgeAuth(), 'changePlan').mockRejectedValue(new Error('Card declined'));
    await mount(<PlanSelector />);

    await act(async () => buttonOf('Team').click());
    await act(async () => container.querySelector<HTMLButtonElement>('.bridge-plan-confirm-actions .bridge-btn-secondary')!.click());
    expect(container.querySelector('[data-bridge-plan-confirm]')).toBeNull();
    expect(changePlan).not.toHaveBeenCalled();

    await act(async () => buttonOf('Team').click());
    await act(async () => container.querySelector<HTMLButtonElement>('[data-bridge-plan-confirm-btn]')!.click());
    await settle();
    expect(container.querySelector('[data-bridge-plan-confirm] [data-bridge-alert]')?.textContent).toContain('Card declined');
  });

  it('an empty plan list offers a retry instead of "No plans available"', async () => {
    initBridge({ appId: 'app-1', apiBaseUrl: 'http://127.0.0.1:1' });
    useBridgeStore.setState({
      tokens: { accessToken: 'at' } as never,
      subscription: { status: { shouldSelectPlan: true } as never, plans: [] as never, loading: false, error: null },
    });
    const auth = getBridgeAuth();
    jest.spyOn(auth, 'getSubscriptionStatus').mockResolvedValue({ shouldSelectPlan: true } as never);
    const getPlans = jest.spyOn(auth, 'getPlans').mockResolvedValue(PLANS as never);
    await mount(<PlanSelector />);
    const empty = container.querySelector('[data-bridge-plan-empty]')!;
    expect(empty.textContent).toContain('The plans could not be loaded.');
    expect(container.textContent).not.toContain('No plans available');
    await act(async () => empty.querySelector('button')!.click());
    await settle();
    expect(getPlans).toHaveBeenCalled();
    expect(container.querySelectorAll('[data-bridge-plan-card]')).toHaveLength(3);
  });
});

describe('<BridgeCheckoutNotice> — the one-time banner, TBP-946', () => {
  it('renders nothing when no checkout has just completed', async () => {
    await mount(<BridgeCheckoutNotice />);
    expect(container.innerHTML).toBe('');
  });

  it('after a paid checkout: names the plan, says the payment went through, and shows once', async () => {
    useBillingBridge().subscription.hydrate({ plan: { slug: 'pro', name: 'Pro' }, status: 'active' } as never);
    markCheckoutComplete({ kind: 'checkout' });
    await mount(<BridgeCheckoutNotice />);
    const banner = container.querySelector('[data-bridge-checkout-notice]')!;
    expect(banner.getAttribute('role')).toBe('status');
    expect(banner.getAttribute('data-kind')).toBe('checkout');
    expect(banner.querySelector('.bridge-checkout-notice-title')?.textContent).toBe("You're on Pro now");
    expect(banner.textContent).toContain('Your payment went through and the new plan is active.');
    // Taken: the signal is cleared, so the next page (or a reload) shows nothing.
    await settle(0);
    expect(checkoutResult.get()).toBeNull();
    await act(async () => root!.unmount());
    root = createRoot(container);
    await act(async () => root!.render(<BridgeCheckoutNotice />));
    expect(container.querySelector('[data-bridge-checkout-notice]')).toBeNull();
  });

  it('shows when the signal arrives after it mounted (a Free pick landing back on an open page)', async () => {
    await mount(<BridgeCheckoutNotice />);
    expect(container.innerHTML).toBe('');
    await act(async () => markCheckoutComplete({ kind: 'plan', planName: 'Free' }));
    expect(container.querySelector('.bridge-checkout-notice-title')?.textContent).toBe("You're on Free now");
    expect(container.textContent).toContain('The change takes effect right away.');
  });

  it('the close button dismisses it; dismissible={false} has none', async () => {
    markCheckoutComplete({ kind: 'plan', planName: 'Free' });
    await mount(<BridgeCheckoutNotice />);
    const close = container.querySelector<HTMLButtonElement>('.bridge-checkout-notice-close')!;
    expect(close.getAttribute('aria-label')).toBe('Dismiss');
    await act(async () => close.click());
    expect(container.querySelector('[data-bridge-checkout-notice]')).toBeNull();

    await remount(() => markCheckoutComplete({ kind: 'plan', planName: 'Free' }), <BridgeCheckoutNotice dismissible={false} />);
    expect(container.querySelector('[data-bridge-checkout-notice]')).not.toBeNull();
    expect(container.querySelector('.bridge-checkout-notice-close')).toBeNull();
  });

  it('children replace the text and get a null plan name when it is not known', async () => {
    markCheckoutComplete({ kind: 'checkout' });
    const seen: unknown[] = [];
    await mount(
      <BridgeCheckoutNotice>
        {(detail: { kind: string; planName: string | null }) => {
          seen.push(detail);
          return <em data-mine="">Thanks!</em>;
        }}
      </BridgeCheckoutNotice>,
    );
    expect(container.querySelector('[data-mine]')?.textContent).toBe('Thanks!');
    expect(container.querySelector('.bridge-checkout-notice-title')).toBeNull();
    expect(seen[0]).toEqual({ kind: 'checkout', planName: null });
    // Without a known plan the default text says so plainly.
    await remount(() => markCheckoutComplete({ kind: 'checkout' }), <BridgeCheckoutNotice />);
    expect(container.querySelector('.bridge-checkout-notice-title')?.textContent).toBe('Your new plan is active');
  });
});

describe('<BridgeBillingRoutes> — the subscription page, TBP-946', () => {
  it('manage: subtitle, a current-plan summary with renewal date and card, and "Change plan"', async () => {
    signedIn({ plan: 'pro' });
    mockNav.pathname = '/subscription';
    await mount(<BridgeBillingRoutes />);
    await act(async () => {
      useBillingBridge().subscription.hydrate({
        plan: { slug: 'pro', name: 'Pro' },
        status: 'active',
        renewsAt: '2026-11-14T12:00:00.000Z',
        cardLast4: '4242',
      } as never);
    });
    expect(container.querySelector('.bridge-billing-heading + .bridge-billing-text')?.textContent).toBe(
      'Your plan, what it includes, and billing.',
    );
    const summary = container.querySelector('[data-bridge-billing-summary]')!;
    expect(summary.querySelector('.bridge-billing-label')?.textContent).toBe('Current plan');
    expect(summary.querySelector('.bridge-subscription-status')?.className).toContain('bridge-billing-summary-status');
    expect(summary.querySelector('[data-bridge-billing-meta]')?.textContent).toMatch(/^Renews .*2026 · Card ending 4242$/);
    expect(container.querySelector('h2.bridge-plan-heading')?.textContent).toBe('Change plan');
    expect(container.querySelector('[data-bridge-checkout-notice]')).toBeNull();
  });

  it('a Free pick lands on the subscription page itself, with the banner', async () => {
    signedIn({ plan: 'pro', paymentsEnabled: false });
    mockNav.pathname = '/subscription';
    const auth = getBridgeAuth();
    jest.spyOn(auth, 'selectFreePlan').mockResolvedValue(undefined as never);
    jest.spyOn(auth, 'getSubscriptionStatus').mockResolvedValue({ plan: { key: 'free', name: 'Free' } } as never);
    jest.spyOn(auth, 'getPlans').mockResolvedValue(PLANS as never);
    await mount(<BridgeBillingRoutes />);
    await act(async () => buttonOf('Free').click());
    await settle();
    expect(auth.selectFreePlan).toHaveBeenCalledWith('free');
    expect(mockNav.push).toHaveBeenCalledWith('/subscription');
    const banner = container.querySelector('[data-bridge-checkout-notice]');
    expect(banner?.getAttribute('data-kind')).toBe('plan');
    expect(banner?.querySelector('.bridge-checkout-notice-title')?.textContent).toBe("You're on Free now");
    expect(buttonOf('Free').textContent).toBe('Current plan');
  });

  it('the paywall page sends a Free pick to the subscription page, wherever the catch-all lives', async () => {
    signedIn({ shouldSelectPlan: true });
    mockNav.params = { bridge: ['plan'] };
    mockNav.pathname = '/account/billing/plan';
    const auth = getBridgeAuth();
    jest.spyOn(auth, 'selectFreePlan').mockResolvedValue(undefined as never);
    jest.spyOn(auth, 'getSubscriptionStatus').mockResolvedValue({ plan: { key: 'free' } } as never);
    jest.spyOn(auth, 'getPlans').mockResolvedValue(PLANS as never);
    await mount(<BridgeBillingRoutes />);
    await act(async () => buttonOf('Free').click());
    await settle();
    expect(mockNav.push).toHaveBeenCalledWith('/account/billing');
    expect(checkoutResult.get()).toEqual({ kind: 'plan', planName: 'Free' });
  });

  it('a paid pick sends Stripe back to the subscription page, not /subscription/success', async () => {
    signedIn({ shouldSelectPlan: true });
    mockNav.params = { bridge: ['plan'] };
    mockNav.pathname = '/subscription/plan';
    const auth = getBridgeAuth();
    const startCheckout = jest
      .spyOn(auth, 'startCheckout')
      .mockResolvedValue({ sessionId: 'cs_1', checkoutUrl: 'https://checkout.stripe.test/cs_1' } as never);
    await mount(<BridgeBillingRoutes />);
    await act(async () => buttonOf('Pro').click());
    await settle();
    const urls = startCheckout.mock.calls[0][2] as { successUrl: string; cancelUrl: string };
    expect(urls.successUrl).toBe(`${window.location.origin}/subscription`);
    expect(urls.cancelUrl).toBe(`${window.location.origin}/subscription/plan`);
    // Nothing is marked until the checkout comes back confirmed.
    expect(checkoutResult.get()).toBeNull();
  });

  it('billing.successRoute sends the checkout anywhere in the app', async () => {
    signedIn({ shouldSelectPlan: true }, { successRoute: '/dashboard' });
    mockNav.params = { bridge: ['plan'] };
    mockNav.pathname = '/subscription/plan';
    const startCheckout = jest
      .spyOn(getBridgeAuth(), 'startCheckout')
      .mockResolvedValue({ sessionId: 'cs_1', checkoutUrl: 'https://checkout.stripe.test/cs_1' } as never);
    await mount(<BridgeBillingRoutes />);
    await act(async () => buttonOf('Pro').click());
    await settle();
    expect((startCheckout.mock.calls[0][2] as { successUrl: string }).successUrl).toBe(`${window.location.origin}/dashboard`);
  });

  it('checkoutNotice={false} hides the banner', async () => {
    signedIn({ plan: 'pro' });
    mockNav.pathname = '/subscription';
    markCheckoutComplete({ kind: 'checkout' });
    await mount(<BridgeBillingRoutes checkoutNotice={false} />);
    expect(container.querySelector('[data-bridge-checkout-notice]')).toBeNull();
  });

  it('the old confirmation page still works, and takes the banner with it', async () => {
    signedIn({ plan: 'pro' });
    mockNav.params = { bridge: ['success'] };
    mockNav.pathname = '/subscription/success';
    markCheckoutComplete({ kind: 'checkout' });
    await mount(<BridgeBillingRoutes />);
    await settle(0);
    expect(container.querySelector('.bridge-billing-heading')?.textContent).toBe("You're all set");
    expect(container.querySelector('[data-bridge-checkout-notice]')).toBeNull();
    expect(checkoutResult.get()).toBeNull();
  });
});

describe('<BridgeProvider> — a Stripe return lands with the banner, TBP-946', () => {
  function stripeReturn(status: Record<string, unknown>) {
    window.history.replaceState({}, '', '/subscription?session_id=cs_test_1');
    initBridge({ appId: 'app-1', apiBaseUrl: 'http://127.0.0.1:1', loginRoute: '/auth/login' });
    const auth = getBridgeAuth();
    jest.spyOn(auth, 'isAuthenticated').mockReturnValue(true);
    useBridgeStore.setState({ tokens: { accessToken: 'at' } as never });
    jest.spyOn(auth, 'shouldRedirectToPaywall').mockResolvedValue(false as never);
    jest.spyOn(auth, 'getPlans').mockResolvedValue(PLANS as never);
    jest.spyOn(auth, 'getSubscriptionStatus').mockImplementation(async () => {
      window.history.replaceState({}, '', '/subscription');
      sessionStorage.removeItem('bridge_checkout_session_id');
      await new Promise((r) => setTimeout(r, 5));
      return status as never;
    });
    mockNav.pathname = '/subscription';
  }

  const provider = (children: React.ReactNode) => (
    <BridgeProvider appId="app-1" config={{ apiBaseUrl: 'http://127.0.0.1:1', loginRoute: '/auth/login', devBadge: false }}>
      {children}
    </BridgeProvider>
  );

  it('a confirmed checkout shows "Your payment went through" on the subscription page, once', async () => {
    stripeReturn({ shouldSelectPlan: false, paymentsAutoRedirect: true, plan: { key: 'pro', name: 'Pro' } });
    await mount(provider(<BridgeBillingRoutes />));
    await settle(50);
    const banner = container.querySelector('[data-bridge-checkout-notice]');
    expect(banner?.getAttribute('data-kind')).toBe('checkout');
    expect(banner?.textContent).toContain('Your payment went through');
    expect(checkoutResult.get()).toBeNull();
    expect(mockNav.push).not.toHaveBeenCalled();
  });

  it('a failed payment marks nothing and goes to the payment error page', async () => {
    stripeReturn({ paymentFailed: true, shouldSelectPlan: true });
    await mount(provider(<span>app</span>));
    await settle(50);
    expect(mockNav.push).toHaveBeenCalledWith('/subscription/error');
    expect(checkoutResult.get()).toBeNull();
  });

  it('an ordinary page load (no checkout return) marks nothing', async () => {
    initBridge({ appId: 'app-1', apiBaseUrl: 'http://127.0.0.1:1' });
    await mount(provider(<BridgeCheckoutNotice />));
    await settle(20);
    expect(container.querySelector('[data-bridge-checkout-notice]')).toBeNull();
  });
});
