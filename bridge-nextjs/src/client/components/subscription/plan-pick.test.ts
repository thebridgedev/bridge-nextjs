// TBP-946 (port of bridge-svelte TBP-762 + TBP-813) — what a pick does.
//
// A pick that changes the plan right here (Free, or a plan Bridge sets without
// Stripe) re-reads
// the subscription, records the pick for the landing page's banner (`complete`)
// and then goes to `successUrl`, the subscription page by default. A page that
// passes `onSelect` takes over. A paid pick leaves for Stripe, which returns
// straight to `successUrl`. A workspace that already pays confirms first.

import type { Plan, PriceOfferSdk } from '@nebulr-group/bridge-auth-core';
import { isFreePick, pickPlan } from './plan-pick';

const FREE = { key: 'free', name: 'Free', prices: [] } as unknown as Plan;
const PRO = { key: 'pro', name: 'Pro', prices: [] } as unknown as Plan;
const METERED = { key: 'metered', name: 'Metered', prices: [], hasCost: true } as unknown as Plan;
const FREE_PRICE = { id: 'f', amount: 0, currency: 'usd', recurrenceInterval: 'month' } as PriceOfferSdk;
const PAID_PRICE = { id: 'p', amount: 29, currency: 'usd', recurrenceInterval: 'month' } as PriceOfferSdk;

function setup(session: { sessionId: string | null; checkoutUrl?: string | null } = { sessionId: 'cs_1', checkoutUrl: 'https://stripe/checkout' }) {
  const order: string[] = [];
  const deps = {
    auth: {
      selectFreePlan: jest.fn(async () => {
        order.push('select');
      }),
      startCheckout: jest.fn(async () => session),
    },
    refresh: jest.fn(async () => {
      order.push('refresh');
    }),
    navigate: jest.fn((url: string) => {
      order.push(`navigate:${url}`);
    }),
    leave: jest.fn((url: string) => {
      order.push(`leave:${url}`);
    }),
    absolute: (url: string) => `http://app${url}`,
    complete: jest.fn((plan: Plan) => {
      order.push(`complete:${plan.key}`);
    }),
  };
  const opts = { paymentsEnabled: false, successUrl: '/subscription', cancelUrl: '/subscription/plan' };
  return { order, deps, opts };
}

describe('pickPlan — TBP-946', () => {
  it('Free: selects, re-reads, records the pick, then goes to the subscription page', async () => {
    const { order, deps, opts } = setup();
    expect(await pickPlan(FREE, FREE_PRICE, opts, deps)).toBe('selected');
    expect(order).toEqual(['select', 'refresh', 'complete:free', 'navigate:/subscription']);
  });

  it('a page that passes onSelect takes over: no navigation, no banner', async () => {
    const { deps, opts } = setup();
    const onSelect = jest.fn();
    await pickPlan(FREE, FREE_PRICE, { ...opts, onSelect }, deps);
    expect(onSelect).toHaveBeenCalledWith({ plan: FREE, price: FREE_PRICE });
    expect(deps.navigate).not.toHaveBeenCalled();
    expect(deps.complete).not.toHaveBeenCalled();
  });

  it('a paid pick leaves for Stripe, which returns to the subscription page; nothing is recorded yet', async () => {
    const { deps, opts } = setup();
    expect(await pickPlan(PRO, PAID_PRICE, opts, deps)).toBe('checkout');
    expect(deps.leave).toHaveBeenCalledWith('https://stripe/checkout');
    expect(deps.auth.startCheckout).toHaveBeenCalledWith('pro', PAID_PRICE, {
      successUrl: 'http://app/subscription',
      cancelUrl: 'http://app/subscription/plan',
    });
    // The checkout return marks the result (<BridgeProvider>), not the pick.
    expect(deps.complete).not.toHaveBeenCalled();
    expect(deps.navigate).not.toHaveBeenCalled();
  });

  it('a paid pick on an app without Stripe (Bridge sets the plan) re-reads, records and goes on', async () => {
    const { order, deps, opts } = setup({ sessionId: null });
    expect(await pickPlan(PRO, PAID_PRICE, opts, deps)).toBe('selected');
    expect(order).toEqual(['refresh', 'complete:pro', 'navigate:/subscription']);
  });

  it('a workspace that already pays is asked to confirm first; nothing is changed yet', async () => {
    const { deps, opts } = setup();
    expect(await pickPlan(PRO, PAID_PRICE, { ...opts, paymentsEnabled: true }, deps)).toBe('confirm');
    expect(deps.auth.startCheckout).not.toHaveBeenCalled();
    expect(deps.refresh).not.toHaveBeenCalled();
    expect(deps.navigate).not.toHaveBeenCalled();
    expect(deps.complete).not.toHaveBeenCalled();
  });

  it('a $0 plan with metered pricing is not Free: it goes through checkout (TBP-275)', async () => {
    const { deps, opts } = setup();
    expect(isFreePick(METERED, FREE_PRICE)).toBe(false);
    expect(isFreePick(FREE, FREE_PRICE)).toBe(true);
    expect(await pickPlan(METERED, FREE_PRICE, opts, deps)).toBe('checkout');
    expect(deps.auth.selectFreePlan).not.toHaveBeenCalled();
  });

  it('a checkout session without a URL is an error, not a silent stop', async () => {
    const { deps, opts } = setup({ sessionId: 'cs_1', checkoutUrl: null });
    await expect(pickPlan(PRO, PAID_PRICE, opts, deps)).rejects.toThrow('Checkout session URL missing');
  });
});

describe('pickPlan records the pick for the landing page — TBP-946', () => {
  it('complete runs with the picked plan BEFORE navigating, so the landing page sees it', async () => {
    const { deps, opts } = setup();
    let completedBeforeNavigate = false;
    deps.navigate.mockImplementation(() => {
      completedBeforeNavigate = deps.complete.mock.calls.length === 1;
    });
    await pickPlan(FREE, FREE_PRICE, opts, deps);
    expect(deps.complete).toHaveBeenCalledTimes(1);
    expect(deps.complete).toHaveBeenCalledWith(FREE);
    expect(completedBeforeNavigate).toBe(true);
  });

  it('complete does not run when the page passes onSelect, on any selected path', async () => {
    const onSelect = jest.fn();
    const free = setup();
    await pickPlan(FREE, FREE_PRICE, { ...free.opts, onSelect }, free.deps);
    expect(free.deps.complete).not.toHaveBeenCalled();

    const noStripe = setup({ sessionId: null });
    expect(await pickPlan(PRO, PAID_PRICE, { ...noStripe.opts, onSelect }, noStripe.deps)).toBe('selected');
    expect(noStripe.deps.complete).not.toHaveBeenCalled();
    expect(onSelect).toHaveBeenCalledTimes(2);
  });

  it('complete is optional: a caller without it still navigates', async () => {
    const { deps, opts } = setup();
    const { complete: _omit, ...withoutComplete } = deps;
    expect(await pickPlan(FREE, FREE_PRICE, opts, withoutComplete)).toBe('selected');
    expect(deps.navigate).toHaveBeenCalledWith('/subscription');
  });
});
