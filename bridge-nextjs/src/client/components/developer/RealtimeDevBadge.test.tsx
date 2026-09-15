/**
 * @jest-environment jsdom
 *
 * TBP-644 — the development-only "Live updates off — why?" badge.
 *
 * Rendered for real with react-dom. `process.env.NODE_ENV` is read at render
 * time, so flipping it here is exactly what a production bundle's text
 * substitution (Next's DefinePlugin) does.
 */
import * as React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { RealtimeStatus } from '@nebulr-group/bridge-auth-core';
import { RealtimeDevBadge } from './RealtimeDevBadge';
import { BridgeProvider } from '../../providers/bridge-provider';
import { _setRealtimeStatusDetail } from '../../../core/realtime-status';
import {
  REALTIME_BADGE_RETRYING_AFTER_MS,
  createRetryClock,
  realtimeBadgeView,
} from '../../../core/realtime-dev-badge';

jest.mock(
  'next/navigation',
  () => ({
    useRouter: () => ({ push: jest.fn(), replace: jest.fn(), refresh: jest.fn() }),
    usePathname: () => '/',
  }),
  { virtual: true },
);

const act: (cb: () => void) => void =
  (React as unknown as { act?: (cb: () => void) => void }).act ??
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('react-dom/test-utils').act;

const unauthorized: RealtimeStatus = {
  state: 'unauthorized',
  reason: 'wrong_app',
  side: 'config',
  retrying: false,
  docsUrl: 'https://thebridge.dev/docs/live-updates/troubleshooting/#wrong_app',
  ref: 'c0ffee42',
  since: 1,
};
const open: RealtimeStatus = { state: 'open', retrying: false, since: 1 };
const retrying: RealtimeStatus = {
  state: 'closed',
  reason: 'connection_lost',
  side: 'network',
  retrying: true,
  ref: 'r1',
  since: 1,
};

const originalEnv = process.env.NODE_ENV;
const env = process.env as Record<string, string | undefined>;
let container: HTMLElement;
let root: Root;

function render(node: React.ReactElement): HTMLElement {
  act(() => root.render(node));
  return container;
}
const toggle = () =>
  container.querySelector<HTMLButtonElement>('[aria-controls="bridge-realtime-dev-badge-panel"]');

beforeAll(() => {
  (globalThis as unknown as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  env.NODE_ENV = 'development';
  _setRealtimeStatusDetail({ state: 'idle', retrying: false, since: 0 });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  env.NODE_ENV = originalEnv;
});

describe('<RealtimeDevBadge>', () => {
  it('shows while live updates are off and expands to the reason, whose side, docs link and ref', () => {
    _setRealtimeStatusDetail(unauthorized);
    render(<RealtimeDevBadge />);
    const button = toggle()!;
    expect(button.textContent).toContain('Live updates off — why?');
    expect(button.getAttribute('type')).toBe('button');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(container.querySelector('[aria-live="polite"]')!.textContent).toBe(
      'Bridge live updates are off: wrong_app',
    );

    act(() => button.click());
    expect(button.getAttribute('aria-expanded')).toBe('true');
    const panel = container.querySelector('#bridge-realtime-dev-badge-panel')!;
    expect(panel.textContent).toContain('wrong_app');
    expect(panel.textContent).toContain('c0ffee42');
    expect(panel.textContent).toContain('Your Bridge settings');
    expect(panel.querySelector('a')!.getAttribute('href')).toBe(unauthorized.docsUrl);
  });

  it('origin_not_allowed (TBP-669): names the allowed origins and shows the fix row', () => {
    // What an auth-core before TBP-669 passes through: side `app`, no hint.
    _setRealtimeStatusDetail({ ...unauthorized, reason: 'origin_not_allowed', side: 'app' });
    render(<RealtimeDevBadge />);
    act(() => toggle()!.click());
    const panel = container.querySelector('#bridge-realtime-dev-badge-panel')!;
    expect(panel.textContent).toContain('origin_not_allowed');
    expect(panel.textContent).toContain("this page's origin is not in the app's allowed origins");
    expect(panel.textContent).not.toContain('apiBaseUrl');
    const hint = panel.querySelector('[data-testid="bridge-realtime-dev-badge-hint"]');
    expect(hint?.textContent).toContain('http://localhost');
    expect(hint?.textContent).toContain('Authentication → Security → Allowed Origins');
  });

  it('no fix row for reasons without a known fix', () => {
    _setRealtimeStatusDetail(unauthorized);
    render(<RealtimeDevBadge />);
    act(() => toggle()!.click());
    expect(container.querySelector('[data-testid="bridge-realtime-dev-badge-hint"]')).toBeNull();
  });

  it('Escape collapses the panel and returns focus to the toggle', () => {
    _setRealtimeStatusDetail(unauthorized);
    render(<RealtimeDevBadge />);
    const button = toggle()!;
    act(() => button.click());
    const panel = container.querySelector('#bridge-realtime-dev-badge-panel')!;
    act(() => {
      panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(button);
  });

  it('dismisses until a NEW problem arrives', () => {
    _setRealtimeStatusDetail(unauthorized);
    render(<RealtimeDevBadge />);
    const dismiss = container.querySelector<HTMLButtonElement>(
      '[aria-label="Dismiss the live updates notice"]',
    )!;
    act(() => dismiss.click());
    expect(toggle()).toBeNull();

    act(() => _setRealtimeStatusDetail({ ...unauthorized, since: 2 }));
    expect(toggle()).toBeNull();
    act(() => _setRealtimeStatusDetail({ ...unauthorized, ref: 'another1', reason: 'expired', side: 'app' }));
    expect(toggle()).not.toBeNull();
  });

  it('renders nothing while live updates work', () => {
    _setRealtimeStatusDetail(open);
    render(<RealtimeDevBadge />);
    expect(toggle()).toBeNull();
  });

  it('renders nothing at all in a production build', () => {
    env.NODE_ENV = 'production';
    _setRealtimeStatusDetail(unauthorized);
    render(<RealtimeDevBadge />);
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing when opted out', () => {
    _setRealtimeStatusDetail(unauthorized);
    render(<RealtimeDevBadge enabled={false} />);
    expect(container.innerHTML).toBe('');
  });
});

describe('<BridgeProvider> mounts the badge', () => {
  // No appId → the provider starts no runtime, so nothing races the status
  // this test sets. The mount itself is what is under test.
  const realWarn = console.warn;
  beforeAll(() => {
    console.warn = () => {};
  });
  afterAll(() => {
    console.warn = realWarn;
  });

  it('without any app code', () => {
    render(
      <BridgeProvider config={{}}>
        <div>child</div>
      </BridgeProvider>,
    );
    act(() => _setRealtimeStatusDetail(unauthorized));
    expect(toggle()).not.toBeNull();
  });

  it('and respects devBadge: false', () => {
    render(
      <BridgeProvider config={{ devBadge: false }}>
        <div>child</div>
      </BridgeProvider>,
    );
    act(() => _setRealtimeStatusDetail(unauthorized));
    expect(container.querySelector('[data-testid="bridge-realtime-dev-badge-root"]')).toBeNull();
    expect(container.textContent).toBe('child');
  });
});

describe('realtimeBadgeView', () => {
  it("shows for 'degraded' and builds the docs link from the reason", () => {
    expect(
      realtimeBadgeView({ state: 'degraded', reason: 'no_channel_accepted', retrying: false, since: 1 }, undefined, 0),
    ).toMatchObject({ docsUrl: 'https://thebridge.dev/docs/live-updates/troubleshooting/#no_channel_accepted' });
  });

  it('shows a retry run only after 30 s, keyed by its ref across state flips', () => {
    expect(realtimeBadgeView(retrying, 0, REALTIME_BADGE_RETRYING_AFTER_MS - 1)).toBeNull();
    const a = realtimeBadgeView(retrying, 0, REALTIME_BADGE_RETRYING_AFTER_MS);
    const b = realtimeBadgeView({ ...retrying, state: 'connecting' }, 0, REALTIME_BADGE_RETRYING_AFTER_MS);
    expect(a?.sideLabel).toMatch(/network/i);
    expect(a?.key).toBe(b?.key);
  });

  it('the retry clock measures from the first status of a run and resets on recovery', () => {
    const clock = createRetryClock();
    expect(clock(retrying, 100)).toBe(100);
    expect(clock({ ...retrying, state: 'connecting' }, 5_000)).toBe(100);
    expect(clock(open, 6_000)).toBeUndefined();
  });
});
