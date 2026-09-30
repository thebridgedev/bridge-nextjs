/**
 * @jest-environment jsdom
 *
 * TBP-742 — the Next.js ten-line integration, rendered.
 *
 * Revert-proof: `BridgeAuthRoutes`, `BridgeBillingRoutes`, `QuotaGate`, the
 * upgrade dialog and `<FeatureFlag upgrade>` do not exist on origin/main, and
 * the provider test below fails there because the environment won over the
 * `appId` prop.
 */
import * as React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useBridge as useBillingBridge, type FlagEvalResult } from '@nebulr-group/bridge-auth-core';

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

let mockFlag: FlagEvalResult<boolean> = { passed: false, value: false };
jest.mock('../../flags/registry', () => {
  const actual = jest.requireActual('../../flags/registry');
  return { ...actual, evaluateFlag: () => mockFlag, subscribeToFlagChanges: () => () => {} };
});

/* eslint-disable @typescript-eslint/no-var-requires */
const { BridgeAuthRoutes } = require('./sdk-auth/BridgeAuthRoutes');
const { BridgeBillingRoutes } = require('./subscription/BridgeBillingRoutes');
const { QuotaGate } = require('./subscription/QuotaGate');
const { PlanSelector } = require('./subscription/PlanSelector');
const { UpgradeDialogHost } = require('./subscription/UpgradeDialogHost');
const { FeatureFlag } = require('./FeatureFlag');
const { BridgeProvider } = require('../providers/bridge-provider');
const { __resetQuotaRefusalForTests, reportQuotaRefusal } = require('../../core/quota-refusal');
const { __resetFeatureUpgradeForTests } = require('../../core/feature-upgrade');
const { _resetBridgeInstance, getBridgeAuth, getBridgeConfig, initBridge, useBridgeStore } = require('../../core/bridge-instance');
const { __resetBridgeRuntime } = require('../../core/bridge-runtime');
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
  // React logs the NEXT_NOT_FOUND throw; the test asserts on it directly.
  console.error = () => {};
  const proto = HTMLDialogElement.prototype as unknown as { showModal?: () => void; close?: () => void };
  proto.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  proto.close ??= function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
});
afterAll(() => {
  console.warn = realWarn;
  console.error = realError;
  console.info = realInfo;
});

beforeEach(() => {
  _resetBridgeInstance();
  __resetQuotaRefusalForTests();
  __resetFeatureUpgradeForTests();
  useBillingBridge().quotas.__resetForTests();
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
});

async function mount(element: React.ReactElement): Promise<void> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(element);
  });
}

function sdkMode() {
  initBridge({ appId: 'app-1', apiBaseUrl: 'http://127.0.0.1:1', loginRoute: '/auth/login' });
}

describe('<BridgeAuthRoutes> — one file serves every sign-in page', () => {
  it('renders the login form for /auth/login, with links built from the catch-all base', async () => {
    sdkMode();
    mockNav.params = { bridge: ['login'] };
    mockNav.pathname = '/auth/login';
    await mount(<BridgeAuthRoutes />);
    const route = container.querySelector('[data-bridge-auth-route]');
    expect(route?.getAttribute('data-bridge-auth-route')).toBe('login');
    expect(container.querySelector('.bridge-auth-page [data-bridge-auth-form]')).not.toBeNull();
  });

  it('set-password/<token> — the page every signup-verification email links to — is served', async () => {
    sdkMode();
    mockNav.params = { bridge: ['set-password', 'tok123'] };
    mockNav.pathname = '/auth/set-password/tok123';
    await mount(<BridgeAuthRoutes />);
    expect(container.querySelector('[data-bridge-auth-route]')?.getAttribute('data-bridge-auth-route')).toBe('set-password');
    expect(container.querySelector('input[type="password"]')).not.toBeNull();
  });

  it('an unknown segment is the app’s own 404', async () => {
    sdkMode();
    mockNav.params = { bridge: ['nope'] };
    mockNav.pathname = '/auth/nope';
    await expect(mount(<BridgeAuthRoutes />)).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('rung 2: frame and heading render-props wrap every page', async () => {
    sdkMode();
    mockNav.params = { bridge: ['signup'] };
    mockNav.pathname = '/auth/signup';
    await mount(
      <BridgeAuthRoutes
        frame={(page: string, children: React.ReactNode) => <section data-frame={page}>{children}</section>}
        heading={(page: string) => <h1 data-my-heading="">My {page}</h1>}
      />,
    );
    expect(container.querySelector('section[data-frame="signup"] [data-bridge-auth-form]')).not.toBeNull();
    expect(container.querySelector('[data-my-heading]')?.textContent).toBe('My signup');
    expect(container.querySelector('.bridge-auth-page')).toBeNull();
  });

  it('hosted mode (no loginRoute): the page links to the hosted login, which follows the stage API address', async () => {
    initBridge({ appId: 'app-1', apiBaseUrl: 'https://api-stage.thebridge.dev', hostedUrl: 'https://auth-stage.thebridge.dev' });
    mockNav.params = { bridge: ['login'] };
    mockNav.pathname = '/auth/login';
    await mount(<BridgeAuthRoutes />);
    const link = container.querySelector('[data-bridge-auth-hosted] a') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toMatch(/^https:\/\/auth-stage\.thebridge\.dev\/auth\/login\/app-1/);
  });

  it('oauth-callback exchanges the code in the browser and goes on to the deep link', async () => {
    initBridge({ appId: 'app-1', apiBaseUrl: 'http://127.0.0.1:1' });
    const handle = jest.spyOn(getBridgeAuth(), 'handleCallback').mockResolvedValue({} as never);
    window.history.replaceState(null, '', '/auth/oauth-callback?code=abc&redirectUri=%2Fprojects');
    mockNav.params = { bridge: ['oauth-callback'] };
    mockNav.pathname = '/auth/oauth-callback';
    await mount(<BridgeAuthRoutes />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(handle).toHaveBeenCalledWith('abc');
    expect(mockNav.replace).toHaveBeenCalledWith('/projects');
    window.history.replaceState(null, '', '/');
  });
});

describe('<BridgeBillingRoutes> — one file serves the subscription pages', () => {
  beforeEach(() => {
    sdkMode();
    jest.spyOn(getBridgeAuth(), 'getSubscriptionStatus').mockResolvedValue({ shouldSelectPlan: true } as never);
    jest.spyOn(getBridgeAuth(), 'getPlans').mockResolvedValue([] as never);
  });

  it.each([
    [undefined, '/subscription', 'manage', 'Subscription'],
    [['plan'], '/subscription/plan', 'plan', 'Choose a plan'],
    [['success'], '/subscription/success', 'success', "You're all set"],
    [['error'], '/subscription/error', 'error', "We couldn't confirm your payment"],
  ])('%j serves the %s page', async (params, pathname, page, heading) => {
    mockNav.params = params ? { bridge: params } : {};
    mockNav.pathname = pathname;
    await mount(<BridgeBillingRoutes />);
    expect(container.querySelector('[data-bridge-billing-route]')?.getAttribute('data-bridge-billing-route')).toBe(page);
    expect(container.querySelector('h1')?.textContent).toBe(heading);
  });

  it('the error page links back to the subscription page', async () => {
    mockNav.params = { bridge: ['error'] };
    mockNav.pathname = '/subscription/error';
    await mount(<BridgeBillingRoutes />);
    expect(container.querySelector('.bridge-billing-action')?.getAttribute('href')).toBe('/subscription');
  });
});

describe('<QuotaGate> — level 1', () => {
  const snap = (used: number, limit: number, extra: Record<string, unknown> = {}) => ({
    metric: 'tickets',
    used,
    limit,
    remaining: limit - used,
    policy: 'hard',
    warningLevel: null,
    ...extra,
  });

  it('disables the action at a known hard cap and offers the upgrade', async () => {
    sdkMode();
    useBillingBridge().quotas.applyInitialSnapshot('tickets', snap(10, 10) as never);
    await mount(
      <QuotaGate metric="tickets">
        <button>New ticket</button>
      </QuotaGate>,
    );
    expect(container.querySelector('[data-bridge-quota-gate]')?.getAttribute('data-state')).toBe('at-limit');
    expect((container.querySelector('fieldset') as HTMLFieldSetElement).disabled).toBe(true);
    expect(container.querySelector('[data-bridge-quota-gate-limit] a')?.getAttribute('href')).toBe('/subscription');
  });

  it('never disables on "don\'t know yet", nor for a metered quota', async () => {
    sdkMode();
    await mount(
      <QuotaGate metric="tickets">
        <button>New ticket</button>
      </QuotaGate>,
    );
    expect(container.querySelector('[data-bridge-quota-gate]')?.getAttribute('data-state')).toBe('loading');
    expect((container.querySelector('fieldset') as HTMLFieldSetElement).disabled).toBe(false);
    await act(async () => {
      useBillingBridge().quotas.applyInitialSnapshot('tickets', snap(12, 10, { policy: 'metered' }) as never);
    });
    expect(container.querySelector('[data-bridge-quota-gate]')?.getAttribute('data-state')).toBe('metered');
    expect((container.querySelector('fieldset') as HTMLFieldSetElement).disabled).toBe(false);
  });
});

describe('the upgrade dialog — level 0', () => {
  it('opens on a quota refusal, names the metric and links to the subscription page (owner)', async () => {
    sdkMode();
    jest.spyOn(getBridgeAuth(), 'canManageBilling').mockReturnValue(true);
    await mount(<UpgradeDialogHost billing={undefined} />);
    expect(container.querySelector('dialog')?.hasAttribute('open')).toBe(false);
    await act(async () => {
      reportQuotaRefusal({ metric: 'tickets', used: 10, limit: 10, fix: null, message: null, url: '/api/tickets' });
    });
    const dialog = container.querySelector('dialog[data-bridge-upgrade-dialog]')!;
    expect(dialog.hasAttribute('open')).toBe(true);
    expect(dialog.getAttribute('data-variant')).toBe('limit');
    expect(dialog.querySelector('[data-bridge-upgrade-dialog-metric]')?.textContent).toBe('tickets');
    expect(dialog.querySelector('[data-bridge-upgrade-dialog-cta]')?.getAttribute('href')).toBe('/subscription');
  });

  it('a member is told to ask the owner, with no upgrade link', async () => {
    sdkMode();
    jest.spyOn(getBridgeAuth(), 'canManageBilling').mockReturnValue(false);
    await mount(<UpgradeDialogHost billing={undefined} />);
    await act(async () => {
      reportQuotaRefusal({ metric: 'tickets', used: null, limit: null, fix: null, message: null, url: '' });
    });
    expect(container.querySelector('[data-bridge-upgrade-dialog-message]')?.getAttribute('data-variant')).toBe('member');
    expect(container.querySelector('[data-bridge-upgrade-dialog-cta]')).toBeNull();
  });

  it('billing.upgradeDialog: false mounts nothing', async () => {
    sdkMode();
    await mount(<UpgradeDialogHost billing={{ upgradeDialog: false }} />);
    expect(container.querySelector('dialog')).toBeNull();
  });
});

describe('<FeatureFlag upgrade> — the feature variant opens only on a click', () => {
  it('shows "Upgrade to use this" for a plan-gated flag; clicking opens the dialog naming the plans', async () => {
    sdkMode();
    jest.spyOn(getBridgeAuth(), 'canManageBilling').mockReturnValue(true);
    useBridgeStore.setState({
      subscription: {
        status: null,
        loading: false,
        error: null,
        plans: [{ key: 'pro', name: 'Pro', prices: [{ amount: 20 }], features: [{ key: 'analytics', name: 'Analytics' }] }],
      },
    });
    mockFlag = { passed: false, value: false, reason: 'plan', feature: 'analytics' } as FlagEvalResult<boolean>;
    await mount(
      <>
        <FeatureFlag flagKey="analytics" defaultValue={false} upgrade>
          <a href="/analytics">Analytics</a>
        </FeatureFlag>
        <UpgradeDialogHost billing={undefined} />
      </>,
    );
    expect(container.querySelector('dialog')?.hasAttribute('open')).toBe(false);
    const btn = container.querySelector('[data-bridge-feature-upgrade="analytics"]') as HTMLButtonElement;
    await act(async () => btn.click());
    const dialog = container.querySelector('dialog')!;
    expect(dialog.getAttribute('data-variant')).toBe('feature');
    expect(dialog.querySelector('[data-bridge-upgrade-dialog-included-in]')?.textContent).toBe('Included in: Pro');
  });

  it('off for a permission: nothing', async () => {
    mockFlag = { passed: false, value: false, reason: 'permission' } as FlagEvalResult<boolean>;
    await mount(
      <FeatureFlag flagKey="analytics" defaultValue={false} upgrade>
        <a href="/analytics">Analytics</a>
      </FeatureFlag>,
    );
    expect(container.innerHTML).toBe('');
  });
});

describe('<PlanSelector> S2 customization hooks', () => {
  it('planDescription and planFooter render inside the default card', async () => {
    sdkMode();
    useBridgeStore.setState({
      subscription: {
        status: { shouldSelectPlan: true } as never,
        loading: false,
        error: null,
        plans: [{ key: 'pro', name: 'Pro', description: 'built-in', prices: [], trial: false }] as never,
      },
    });
    await mount(
      <PlanSelector
        planDescription={({ plan }: { plan: { name: string } }) => <p data-desc="">Custom {plan.name}</p>}
        planFooter={({ plan }: { plan: { key: string } }) => <footer data-foot="">{plan.key} footer</footer>}
      />,
    );
    expect(container.querySelector('[data-desc]')?.textContent).toBe('Custom Pro');
    expect(container.querySelector('[data-foot]')?.textContent).toBe('pro footer');
    expect(container.textContent).not.toContain('built-in');
  });
});

describe('<BridgeProvider> — props win over the environment', () => {
  const saved = process.env.NEXT_PUBLIC_BRIDGE_APP_ID;
  afterEach(() => {
    if (saved === undefined) delete process.env.NEXT_PUBLIC_BRIDGE_APP_ID;
    else process.env.NEXT_PUBLIC_BRIDGE_APP_ID = saved;
  });

  it('the appId prop is the app Bridge starts with, even when NEXT_PUBLIC_BRIDGE_APP_ID is set', async () => {
    process.env.NEXT_PUBLIC_BRIDGE_APP_ID = 'env-app';
    await mount(
      <BridgeProvider appId="prop-app" config={{ apiBaseUrl: 'http://127.0.0.1:1', devBadge: false }}>
        <span>child</span>
      </BridgeProvider>,
    );
    expect(getBridgeConfig().appId).toBe('prop-app');
    // …and it mounts the upgrade dialog with no code on the page.
    expect(container.querySelector('dialog[data-bridge-upgrade-dialog]')).not.toBeNull();
  });
});
