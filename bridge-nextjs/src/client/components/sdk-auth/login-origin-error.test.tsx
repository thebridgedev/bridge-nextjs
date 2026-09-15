/**
 * @jest-environment jsdom
 *
 * TBP-669 — LoginForm must show a sign-in failure instead of "Signing in…",
 * and name the fix when Bridge refuses this page's origin.
 *
 * On stage, a magic-link sign-in from an origin missing from the app's allowed
 * origins was accepted, then the token exchange answered 403 "Origin not
 * allowed". The auth state stayed at `credentials-validated` (auth-core before
 * TBP-669 did not reset it), and LoginForm renders every non-`unauthenticated`
 * state as the settling spinner — so the error it had caught never rendered.
 *
 * Driven for real, like login-settling.test.tsx: the component is mounted with
 * react-dom, the auth-core call is stubbed to do what auth-core does (move the
 * state, then throw), and the form is submitted through the DOM. The installed
 * auth-core is the published 0.7.0-beta.0, so the error is the plain HttpError
 * older apps get — the feature-detect path.
 */
import * as React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { HttpError, en } from '@nebulr-group/bridge-auth-core';

import { LoginForm } from './LoginForm';
import { _resetOriginReports } from './shared/auth-error';
import { getBridgeAuth, initBridge, useBridgeStore, _resetBridgeInstance } from '../../../core/bridge-instance';
import { originNotAllowedHint } from '../../../shared/allowed-origins';
import type { BridgeConfig } from '../../../shared/types/config';

const act = (React as unknown as { act: (cb: () => Promise<void> | void) => Promise<void> }).act;
const g = globalThis as unknown as Record<string, unknown>;

// jsdom serves the page from http://localhost.
const FIX = originNotAllowedHint('http://localhost');
const originRefusal = () =>
  new HttpError('Origin not allowed', 403, { message: 'Origin not allowed', error: 'Forbidden', statusCode: 403 });

const realWarn = console.warn;
const realError = console.error;
beforeAll(() => {
  g.IS_REACT_ACT_ENVIRONMENT = true;
  console.warn = () => {};
});
afterAll(() => {
  console.warn = realWarn;
});

let container: HTMLElement;
let root: Root | null = null;
let consoleError: jest.Mock;

beforeEach(() => {
  _resetOriginReports();
  consoleError = jest.fn();
  console.error = consoleError;
  _resetBridgeInstance();
  initBridge({ appId: 'tbp-669', apiBaseUrl: 'http://127.0.0.1:1' } as unknown as BridgeConfig);
});

afterEach(async () => {
  const current = root;
  root = null;
  if (current) await act(async () => current.unmount());
  container?.remove();
  _resetBridgeInstance();
  window.history.replaceState({}, '', '/');
  console.error = realError;
});

async function mount(element: React.ReactElement): Promise<void> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(element);
  });
}

/** Move the store the way auth-core's state manager does. */
function moveTo(authState: string): void {
  useBridgeStore.setState({ authState, isLoading: false } as never);
}

async function setState(authState: string): Promise<void> {
  await act(async () => moveTo(authState));
}

/** Let rejected promises settle and React commit. */
async function flush(): Promise<void> {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

function type(el: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  setter.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

async function submitPassword(email = 'dev@example.com', password = 'hunter22'): Promise<void> {
  await act(async () => {
    type(container.querySelector<HTMLInputElement>('#login-email')!, email);
    type(container.querySelector<HTMLInputElement>('#login-password')!, password);
  });
  await act(async () => {
    container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  await flush();
}

const passwordField = () => container.querySelector('input[type="password"]');
const settlingCard = () => container.querySelector('[data-bridge-auth-settling]');
const alertText = () => container.querySelector('[role="alert"], .bridge-alert')?.textContent ?? '';
const text = () => container.textContent ?? '';

describe('LoginForm — a failed token exchange is shown, not "Signing in…" (TBP-669)', () => {
  it('password sign-in: auth-core stays at credentials-validated → the form shows the fix', async () => {
    jest.spyOn(getBridgeAuth(), 'authenticate').mockImplementation(async () => {
      moveTo('credentials-validated');
      throw originRefusal();
    });
    await mount(<LoginForm />);
    await setState('unauthenticated');
    await submitPassword();

    expect(settlingCard()).toBeNull();
    expect(text()).toContain(FIX);
    // The user can try again from the same screen.
    expect(passwordField()).not.toBeNull();
  });

  it('password sign-in: auth-core resets to unauthenticated → the fix, not the bare "Origin not allowed"', async () => {
    jest.spyOn(getBridgeAuth(), 'authenticate').mockImplementation(async () => {
      moveTo('unauthenticated');
      throw originRefusal();
    });
    await mount(<LoginForm />);
    await setState('unauthenticated');
    await submitPassword();

    expect(text()).toContain(FIX);
    expect(text()).not.toMatch(/Origin not allowed(?! )/);
    // And one console line naming the origin and the docs.
    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(String(consoleError.mock.calls[0][0])).toContain('http://localhost');
  });

  it('magic link: the token from the URL is accepted, the exchange is refused → the fix, within the same render pass', async () => {
    window.history.replaceState({}, '', '/login?bridge_magic_link_token=tok-1');
    const spy = jest.spyOn(getBridgeAuth(), 'authenticateWithMagicLinkToken').mockImplementation(async () => {
      moveTo('credentials-validated');
      throw originRefusal();
    });
    await mount(<LoginForm />);
    await flush();

    expect(spy).toHaveBeenCalledWith('tok-1');
    expect(settlingCard()).toBeNull();
    expect(text()).toContain(FIX);
  });

  it('passkey: a refused exchange reaches LoginForm and shows the fix', async () => {
    jest.spyOn(getBridgeAuth(), 'authenticateWithPasskey').mockImplementation(async () => {
      moveTo('credentials-validated');
      throw originRefusal();
    });
    const onError = jest.fn();
    await mount(<LoginForm showPasskeys onError={onError} />);
    await setState('unauthenticated');
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-bridge-passkey-login]')!.click();
    });
    await flush();

    expect(settlingCard()).toBeNull();
    expect(text()).toContain(FIX);
    // The app's onError still hears about it, with the status intact.
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
  });

  it('MFA: a refusal that ends the sign-in flows up from MfaChallenge to the credentials form', async () => {
    jest.spyOn(getBridgeAuth(), 'verifyMfa').mockImplementation(async () => {
      moveTo('unauthenticated');
      throw originRefusal();
    });
    await mount(<LoginForm />);
    await setState('mfa-required');
    await act(async () => {
      type(container.querySelector<HTMLInputElement>('#mfa-code')!, '123456');
    });
    await act(async () => {
      container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    await flush();

    expect(passwordField()).not.toBeNull();
    expect(text()).toContain(FIX);
  });

  it('MFA on an older auth-core (state stays mfa-required): MfaChallenge itself shows the fix', async () => {
    jest.spyOn(getBridgeAuth(), 'verifyMfa').mockImplementation(async () => {
      throw originRefusal();
    });
    await mount(<LoginForm />);
    await setState('mfa-required');
    await act(async () => {
      type(container.querySelector<HTMLInputElement>('#mfa-code')!, '123456');
    });
    await act(async () => {
      container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    await flush();

    expect(text()).toContain(en['mfa.challengeHeading']);
    expect(text()).toContain(FIX);
  });
});

describe('LoginForm — everything else is unchanged (TBP-669 / TBP-635)', () => {
  it('another 403 keeps its own message', async () => {
    jest.spyOn(getBridgeAuth(), 'authenticate').mockImplementation(async () => {
      throw new HttpError('User is disabled', 403, { message: 'User is disabled', statusCode: 403 });
    });
    await mount(<LoginForm />);
    await setState('unauthenticated');
    await submitPassword();

    expect(text()).toContain('User is disabled');
    expect(text()).not.toContain(FIX);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('a stale error from an earlier attempt does not hijack a later sign-in', async () => {
    // A wrong password, then a sign-in that succeeds and moves the state on.
    jest.spyOn(getBridgeAuth(), 'authenticate').mockImplementation(async () => {
      throw new HttpError('Invalid email or password.', 401);
    });
    await mount(<LoginForm />);
    await setState('unauthenticated');
    await submitPassword();
    expect(text()).toContain('Invalid email or password.');

    await setState('credentials-validated');
    expect(settlingCard()).not.toBeNull();
    expect(passwordField()).toBeNull();
    expect(alertText()).toBe('');
  });

  it('without an error, credentials-validated is still the settling card', async () => {
    await mount(<LoginForm />);
    await setState('credentials-validated');
    expect(settlingCard()).not.toBeNull();
    expect(passwordField()).toBeNull();
  });
});
