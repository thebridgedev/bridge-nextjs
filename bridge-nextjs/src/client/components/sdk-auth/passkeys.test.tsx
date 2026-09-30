/**
 * @jest-environment jsdom
 *
 * TBP-515 (passkeys) — the browser ceremony between auth-core's options and its
 * verification. Revert-proof: on origin/main `PasskeyLogin` called
 * `authenticateWithPasskey()` with no browser response, and `PasskeySetup`
 * called a `registerPasskeyWithToken()` auth-core does not have, so both
 * tests below fail there (no options fetch, no ceremony, a TypeError).
 */
import * as React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { PasskeyLogin } from './PasskeyLogin';
import { PasskeySetup } from './PasskeySetup';
import { LoginForm } from './LoginForm';
import { _resetBridgeInstance, getBridgeAuth, initBridge } from '../../../core/bridge-instance';

const act = (React as unknown as { act: (cb: () => Promise<void> | void) => Promise<void> }).act;
const g = globalThis as unknown as Record<string, unknown>;
type W = Window & { __simpleWebAuthn?: unknown; PublicKeyCredential?: unknown };

let container: HTMLElement;
let root: Root | null = null;
const ceremony = {
  startAuthentication: jest.fn(async () => ({ id: 'assertion' })),
  startRegistration: jest.fn(async () => ({ id: 'credential' })),
};

beforeAll(() => {
  g.IS_REACT_ACT_ENVIRONMENT = true;
  g.fetch = () => Promise.reject(new Error('offline (unit test)'));
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

beforeEach(() => {
  _resetBridgeInstance();
  initBridge({ appId: 'app-1', apiBaseUrl: 'http://127.0.0.1:1', loginRoute: '/auth/login' });
  (window as W).__simpleWebAuthn = ceremony;
  (window as W).PublicKeyCredential = function PublicKeyCredential() {};
  ceremony.startAuthentication.mockClear();
  ceremony.startRegistration.mockClear();
});

afterEach(async () => {
  const current = root;
  root = null;
  if (current) await act(async () => current.unmount());
  container?.remove();
  delete (window as W).__simpleWebAuthn;
  delete (window as W).PublicKeyCredential;
  _resetBridgeInstance();
});

async function mount(el: React.ReactElement) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root!.render(el));
}

it('PasskeyLogin: options → browser assertion → authenticateWithPasskey(assertion)', async () => {
  const auth = getBridgeAuth();
  jest.spyOn(auth, 'getPasskeyAuthOptions').mockResolvedValue({ challenge: 'c' } as never);
  const authenticate = jest.spyOn(auth, 'authenticateWithPasskey').mockResolvedValue({} as never);
  jest.spyOn(auth, 'isAuthenticated').mockReturnValue(true);
  const onLogin = jest.fn();
  await mount(<PasskeyLogin onLogin={onLogin} />);
  await act(async () => (container.querySelector('button') as HTMLButtonElement).click());
  expect(ceremony.startAuthentication).toHaveBeenCalledWith({ optionsJSON: { challenge: 'c' }, useBrowserAutofill: false });
  expect(authenticate).toHaveBeenCalledWith({ id: 'assertion' });
  expect(onLogin).toHaveBeenCalledTimes(1);
});

it('PasskeyLogin: no passkey in the browser offers setup instead of an error', async () => {
  const auth = getBridgeAuth();
  jest.spyOn(auth, 'getPasskeyAuthOptions').mockResolvedValue({} as never);
  ceremony.startAuthentication.mockRejectedValueOnce(Object.assign(new Error('nope'), { name: 'NotAllowedError' }));
  const onSetupPasskey = jest.fn();
  const onError = jest.fn();
  await mount(<PasskeyLogin onSetupPasskey={onSetupPasskey} onError={onError} />);
  await act(async () => (container.querySelector('button') as HTMLButtonElement).click());
  expect(onSetupPasskey).toHaveBeenCalled();
  expect(onError).not.toHaveBeenCalled();
});

it('PasskeySetup: options → browser credential → verifyPasskeyRegistration(credential, token)', async () => {
  const auth = getBridgeAuth();
  const options = jest.spyOn(auth, 'getPasskeyRegistrationOptions').mockResolvedValue({ rp: {} } as never);
  const verify = jest.spyOn(auth, 'verifyPasskeyRegistration').mockResolvedValue({ verified: true } as never);
  const onComplete = jest.fn();
  await mount(<PasskeySetup token="tok-1" onComplete={onComplete} />);
  await act(async () => (container.querySelector('button') as HTMLButtonElement).click());
  expect(options).toHaveBeenCalledWith('tok-1');
  expect(ceremony.startRegistration).toHaveBeenCalledWith({ optionsJSON: { rp: {} } });
  expect(verify).toHaveBeenCalledWith({ id: 'credential' }, 'tok-1');
  expect(onComplete).toHaveBeenCalled();
  expect(container.querySelector('[data-variant="success"]')).not.toBeNull();
});

it('PasskeySetup: a failed verification is an error, not a success', async () => {
  const auth = getBridgeAuth();
  jest.spyOn(auth, 'getPasskeyRegistrationOptions').mockResolvedValue({} as never);
  jest.spyOn(auth, 'verifyPasskeyRegistration').mockResolvedValue({ verified: false } as never);
  const onComplete = jest.fn();
  await mount(<PasskeySetup token="tok-1" onComplete={onComplete} />);
  await act(async () => (container.querySelector('button') as HTMLButtonElement).click());
  expect(onComplete).not.toHaveBeenCalled();
  expect(container.querySelector('[data-variant="error"]')).not.toBeNull();
});

// TBP-742 — found on stage with the published 0.8.0-beta.1: "no passkey on this
// device" sent LoginForm to `/auth/setup-passkey`, an address <BridgeAuthRoutes>
// does not serve (it serves `setup-passkey/<token>` only), so the person landed
// on a 404. Revert-proof: before the fix LoginForm passed only `setupHref`, the
// click navigated away and no request-link form ever rendered here.
it('LoginForm: no passkey in the browser asks for the email in place, not a 404 page', async () => {
  const auth = getBridgeAuth();
  jest.spyOn(auth, 'getPasskeyAuthOptions').mockResolvedValue({} as never);
  ceremony.startAuthentication.mockRejectedValueOnce(Object.assign(new Error('nope'), { name: 'NotAllowedError' }));
  const before = window.location.href;
  await mount(<LoginForm showPasskeys />);
  const passkeyBtn = container.querySelector('[data-bridge-passkey-login]') as HTMLButtonElement;
  expect(passkeyBtn).not.toBeNull();
  await act(async () => passkeyBtn.click());
  expect(container.querySelector('#passkey-request-email')).not.toBeNull();
  expect(container.querySelector('#login-email')).toBeNull();
  expect(window.location.href).toBe(before);
});

it('LoginForm: an explicit passkeySetupHref still wins', async () => {
  const auth = getBridgeAuth();
  jest.spyOn(auth, 'getPasskeyAuthOptions').mockResolvedValue({} as never);
  ceremony.startAuthentication.mockRejectedValueOnce(Object.assign(new Error('nope'), { name: 'NotAllowedError' }));
  await mount(<LoginForm showPasskeys passkeySetupHref="#my-setup" />);
  await act(async () => (container.querySelector('[data-bridge-passkey-login]') as HTMLButtonElement).click());
  expect(container.querySelector('#passkey-request-email')).toBeNull();
  expect(window.location.hash).toBe('#my-setup');
});
