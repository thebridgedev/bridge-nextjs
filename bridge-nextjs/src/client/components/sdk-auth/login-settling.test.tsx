/**
 * @jest-environment jsdom
 *
 * TBP-635 — LoginForm must never draw the credentials form to somebody who has
 * already authenticated.
 *
 * The top-level branch named `mfa-required`, `mfa-setup-required` and
 * `tenant-selection`, and let everything else fall through to the password
 * form. `authenticated` and `credentials-validated` are also everything else,
 * so between the token exchange resolving and the host app's router landing —
 * LoginForm fires `onLogin` and deliberately does not navigate — the component
 * showed a password field to a user who had just typed their password
 * correctly. That reads as a refusal.
 *
 * Two kinds of assertion, because the defect has two halves.
 *
 * 1. An EXHAUSTIVE sweep of `AuthState`, read out of auth-core's shipped type
 *    declaration rather than hardcoded. The bug was an unhandled branch, so the
 *    guard that prevents recurrence is "exactly one state renders a password
 *    field" — a seventh state added to auth-core tomorrow is covered the moment
 *    it exists.
 *
 * 2. A MutationObserver over the real transition, per the ticket: a sampling
 *    loop can miss a race, so record every DOM batch. It is paired with a
 *    per-commit inspection, because observer delivery is a scheduling detail
 *    and the guarantee should not depend on one.
 *
 * No @testing-library/react in this package, so this uses createRoot plus
 * React's `act`, the same way strictmode-remount.test.tsx does.
 */
import * as React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { en, sv } from '@nebulr-group/bridge-auth-core';

import { LoginForm } from './LoginForm';
import {
  initBridge,
  useBridgeStore,
  _resetBridgeInstance,
} from '../../../core/bridge-instance';
import type { BridgeConfig } from '../../../shared/types/config';

const act = (React as unknown as { act: (cb: () => Promise<void> | void) => Promise<void> }).act;
const g = globalThis as unknown as Record<string, unknown>;

/**
 * Every `AuthState`, parsed out of the auth-core declaration the package
 * actually ships.
 *
 * Deliberately not a literal list: a hardcoded one would still say six when
 * auth-core says seven, and the bug being fixed is precisely a state nobody
 * remembered to handle. Parsing throws rather than returning a short list, so a
 * refactor that moves the type fails this suite loudly instead of quietly
 * testing fewer states.
 */
function authStates(): string[] {
  const candidates = [
    path.resolve('node_modules/@nebulr-group/bridge-auth-core/dist/types.d.ts'),
    path.resolve('../node_modules/@nebulr-group/bridge-auth-core/dist/types.d.ts'),
  ];
  const dts = candidates.find((c) => fs.existsSync(c));
  if (!dts) throw new Error(`auth-core types.d.ts not found in:\n  ${candidates.join('\n  ')}`);
  const match = fs.readFileSync(dts, 'utf8').match(/export type AuthState\s*=([^;]+);/);
  if (!match) throw new Error('Could not find `export type AuthState` in auth-core types.d.ts.');
  const states = [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  if (states.length < 2) throw new Error(`Parsed only ${states.length} AuthState members.`);
  return states;
}

const STATES = authStates();

const realWarn = console.warn;
beforeAll(() => {
  g.IS_REACT_ACT_ENVIRONMENT = true;
  console.warn = () => {};
});
afterAll(() => {
  console.warn = realWarn;
});

let container: HTMLElement;
let root: Root | null = null;

function boot(locale?: string): void {
  _resetBridgeInstance();
  initBridge({
    appId: 'tbp-635',
    apiBaseUrl: 'http://127.0.0.1:1',
    locale,
  } as unknown as BridgeConfig);
}

async function mount(element: React.ReactElement): Promise<void> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(element);
  });
}

/** Drive the store the way auth-core does, inside `act` so React commits. */
async function setState(authState: string): Promise<void> {
  await act(async () => {
    useBridgeStore.setState({ authState, isLoading: false } as never);
  });
}

const passwordField = () => container.querySelector('input[type="password"]');
const settlingCard = () => container.querySelector('[data-bridge-auth-settling]');
const text = () => container.textContent ?? '';

async function unmount(): Promise<void> {
  const current = root;
  root = null;
  if (current) await act(async () => current.unmount());
  container?.remove();
}

afterEach(async () => {
  await unmount();
  _resetBridgeInstance();
});

// ---------------------------------------------------------------------------

describe('AuthState coverage (TBP-635)', () => {
  it('reads the real state list out of the shipped auth-core types', () => {
    expect(STATES).toContain('unauthenticated');
    expect(STATES).toContain('authenticated');
    expect(STATES).toContain('credentials-validated');
    expect(STATES.length).toBeGreaterThanOrEqual(6);
  });
});

describe('LoginForm never shows the credentials form post-auth (TBP-635)', () => {
  it('renders a password field for `unauthenticated` and for nothing else', async () => {
    const withPassword: string[] = [];
    for (const state of STATES) {
      boot();
      await mount(<LoginForm />);
      await setState(state);
      if (passwordField()) withPassword.push(state);
      await unmount();
    }
    // Both directions. Asserting only "authenticated has no password field"
    // would pass for a component that rendered nothing at all, ever.
    expect(withPassword).toEqual(['unauthenticated']);
  });

  for (const state of ['authenticated', 'credentials-validated']) {
    it(`shows the settling card at "${state}"`, async () => {
      boot();
      await mount(<LoginForm />);
      await setState(state);
      expect(settlingCard()).not.toBeNull();
      expect(passwordField()).toBeNull();
      // Not a blank card: an empty box during a pause is its own bad message.
      expect(text()).toContain(en['login.submitting']);
    });
  }

  it('translates the waiting copy', async () => {
    boot('sv');
    await mount(<LoginForm />);
    await setState('authenticated');
    expect(text()).toContain(sv['login.submitting']);
    expect(text()).not.toContain(en['login.submitting']);
  });

  it('suppresses the heading while settling, so no stale "Log in" survives', async () => {
    boot();
    await mount(<LoginForm heading="Log in to NorthWhistle" />);
    await setState('authenticated');
    expect(text()).not.toContain('Log in to NorthWhistle');
    expect(settlingCard()).not.toBeNull();
  });

  it('still hands the delegated states to their own components', async () => {
    // The fix must not have swallowed the branches that already worked — an
    // over-eager `!== unauthenticated` placed above them would do exactly that.
    boot();
    await mount(<LoginForm />);
    await setState('tenant-selection');
    expect(container.querySelector('.bridge-tenant-list')).not.toBeNull();
    await unmount();

    boot();
    await mount(<LoginForm />);
    await setState('mfa-required');
    expect(text()).toContain(en['mfa.challengeHeading']);
  });

  it('leaves the unauthenticated step machine alone', async () => {
    boot();
    await mount(<LoginForm />);
    await setState('unauthenticated');
    expect(passwordField()).not.toBeNull();
    expect(settlingCard()).toBeNull();
  });
});

describe('no password field appears during the settle window (TBP-635)', () => {
  /**
   * Two recorders, because neither alone is enough.
   *
   * The MutationObserver is the ticket's suggestion: it can catch a DOM that
   * appears and disappears BETWEEN two commits, which is the flash this bug is
   * about. The per-commit `look()` is the deterministic half — every state
   * React actually commits is inspected, with no dependence on observer
   * delivery. This is not interval sampling, which the ticket rightly warns
   * against.
   */
  async function recordTransition(states: string[]): Promise<Set<string>> {
    boot();
    await mount(<LoginForm />);
    await setState('unauthenticated');

    const seen = new Set<string>();
    const look = () => {
      if (passwordField()) seen.add('credentials');
      if (settlingCard()) seen.add('settling');
      if (container.querySelector('.bridge-tenant-list')) seen.add('tenant');
    };

    const observer = new MutationObserver(look);
    observer.observe(container, { childList: true, subtree: true, attributes: true });

    for (const s of states) {
      await setState(s);
      await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
      });
      look();
    }

    if (observer.takeRecords().length > 0) look();
    observer.disconnect();
    return seen;
  }

  it('multi-workspace path: tenant-selection → authenticated', async () => {
    const seen = await recordTransition(['tenant-selection', 'authenticated']);
    expect(seen.has('tenant')).toBe(true);
    expect(seen.has('settling')).toBe(true);
    expect(seen.has('credentials')).toBe(false);
  });

  it('single-workspace path: straight to authenticated', async () => {
    const seen = await recordTransition(['authenticated']);
    expect(seen.has('settling')).toBe(true);
    expect(seen.has('credentials')).toBe(false);
  });

  it('the recorder actually records — it catches a credentials render', async () => {
    // Vacuity guard. Without this, a broken recorder would make both tests
    // above pass by seeing nothing at all.
    const seen = await recordTransition(['unauthenticated', 'mfa-required', 'unauthenticated']);
    expect(seen.has('credentials')).toBe(true);
  });
});

describe('onLogin lifecycle is unchanged (TBP-635)', () => {
  it('fires exactly once, when the state reaches `authenticated`', async () => {
    // The tempting wrong fix is to move `onLogin` earlier so the consumer
    // navigates sooner — which would fire it before the session is real.
    boot();
    let calls = 0;
    await mount(<LoginForm onLogin={() => { calls += 1; }} />);
    await setState('unauthenticated');
    expect(calls).toBe(0);

    await setState('credentials-validated');
    expect(calls).toBe(0);

    await setState('authenticated');
    expect(calls).toBe(1);
  });
});
