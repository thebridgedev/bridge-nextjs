/**
 * @jest-environment jsdom
 *
 * Regression: <BridgeProvider> must survive React StrictMode's dev-only
 * double-mount (TBP-206).
 *
 * React 18/19 StrictMode simulates a full mount → unmount → remount on the SAME
 * fiber in development, and Next.js turns StrictMode on by default
 * (`reactStrictMode: true`), so every `next dev` session hits this. The
 * provider's cleanup tears the Bridge runtime down, but the component does NOT
 * re-render on that remount — so anything the provider only did during render
 * (the `initedRef`-guarded bootstrap) is never redone. Before the fix,
 * StrictMode left every dev session with a permanently dead realtime channel:
 * no session.snapshot fanout, no live flag updates, no token-driven channel
 * rescoping.
 *
 * Two invariants are load-bearing and are asserted separately below:
 *   1. `stopBridgeRuntime()` drops its module state SYNCHRONOUSLY, so the
 *      stop → start pair StrictMode fires back-to-back in one commit actually
 *      restarts (an `await`-first stop leaves `_realtime` set, the immediate
 *      `startBridgeRuntime()` no-ops, then the stop lands and kills it).
 *   2. The provider re-asserts the runtime from a mount EFFECT, not only from
 *      render, so the remount rebuilds what the cleanup removed.
 *
 * Runs on jsdom + the real react-dom dev commit phase — StrictMode's
 * double-invoke only exists in the dev build's effect scheduler, so a hand-
 * rolled mount/unmount pair would not reproduce it.
 */
import * as React from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { BridgeProvider } from './bridge-provider';
import {
  __resetBridgeRuntime,
  getBridgeRealtime,
  startBridgeRuntime,
  stopBridgeRuntime,
} from '../../core/bridge-runtime';
import { _resetBridgeInstance } from '../../core/bridge-instance';
import { getBridgeFlagsInstance, setBridgeFlagsInstance } from '../../flags/registry';
import type { BridgeConfig } from '../../shared/types/config';

// `next/navigation`'s hooks require an App Router context this test does not
// mount; the provider only needs `router.push` to exist. Virtual so the test
// does not depend on `next` being installed.
jest.mock(
  'next/navigation',
  () => ({
    useRouter: () => ({ push: jest.fn(), replace: jest.fn(), refresh: jest.fn() }),
    usePathname: () => '/',
  }),
  { virtual: true },
);

// ── offline network, so this stays a lifecycle test and not a transport one ──
const offline = (): Promise<never> =>
  Promise.reject(new Error('offline (bridge-nextjs unit test)'));

class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  readyState = 0;
  constructor(public readonly url: string) {}
  send(): void {}
  close(): void {
    this.readyState = 3;
  }
  addEventListener(): void {}
  removeEventListener(): void {}
}

const g = globalThis as unknown as Record<string, unknown>;

// Best-effort background work (token refresh, app config, flag hydrate) all
// rejects against the offline stub. Those rejections are expected; mute the two
// channels the SDK logs them on so a real failure stays readable. `console.error`
// is deliberately left alone.
const realWarn = console.warn;
const realDebug = console.debug;
const swallow = (): void => {};

beforeAll(() => {
  g.IS_REACT_ACT_ENVIRONMENT = true;
  g.fetch = offline;
  g.WebSocket = FakeWebSocket;
  process.on('unhandledRejection', swallow);
  console.warn = swallow;
  console.debug = swallow;
});

afterAll(() => {
  process.off('unhandledRejection', swallow);
  console.warn = realWarn;
  console.debug = realDebug;
});

// `clearMocks: true` in jest.config resets the module mock's jest.fn()s between
// tests, which is fine — the factory re-runs per render.
const act = (React as unknown as { act: (cb: () => Promise<void>) => Promise<void> }).act;

const TEST_CONFIG = {
  appId: 'strictmode-test-app',
  apiBaseUrl: 'http://127.0.0.1:1',
} as unknown as BridgeConfig;

let container: HTMLElement;
let root: Root;

function tree(strict: boolean): React.ReactElement {
  const provider = React.createElement(
    BridgeProvider,
    { config: TEST_CONFIG },
    React.createElement('div', null, 'child'),
  );
  return strict ? React.createElement(React.StrictMode, null, provider) : provider;
}

async function mount(strict: boolean): Promise<void> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(tree(strict));
  });
  // Let the awaited half of stopBridgeRuntime()/flags stop() settle, so a
  // teardown that "wins the race" would be visible to the assertions below.
  await act(async () => {
    await new Promise((r) => setTimeout(r, 50));
  });
}

beforeEach(() => {
  __resetBridgeRuntime();
  _resetBridgeInstance();
  setBridgeFlagsInstance(undefined);
});

afterEach(() => {
  container?.remove();
});

describe('BridgeProvider — StrictMode double-mount', () => {
  it('leaves the bridge runtime live after the simulated remount', async () => {
    await mount(true);

    // The regression: these were `undefined`, for the rest of the page's life.
    expect(getBridgeRealtime()).toBeDefined();
    expect(getBridgeFlagsInstance()).toBeDefined();
    expect(container.textContent).toBe('child');
  });

  it('matches a plain (production-shaped) single mount', async () => {
    await mount(false);

    expect(getBridgeRealtime()).toBeDefined();
    expect(getBridgeFlagsInstance()).toBeDefined();
  });

  it('still tears the runtime down on a genuine unmount (no leak)', async () => {
    await mount(true);
    expect(getBridgeRealtime()).toBeDefined();

    await act(async () => {
      root.unmount();
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(getBridgeRealtime()).toBeUndefined();
  });
});

describe('stopBridgeRuntime', () => {
  it('drops the runtime synchronously so an immediate restart wins', async () => {
    startBridgeRuntime();
    expect(getBridgeRealtime()).toBeDefined();

    // Deliberately NOT awaited — this is exactly how the provider's cleanup
    // calls it, and how StrictMode sequences cleanup → remount effect.
    const flushed = stopBridgeRuntime();
    expect(getBridgeRealtime()).toBeUndefined();

    startBridgeRuntime();
    const restarted = getBridgeRealtime();
    expect(restarted).toBeDefined();

    // The in-flight flush of the OLD client must not clear the new one.
    await flushed;
    expect(getBridgeRealtime()).toBe(restarted);
  });
});
