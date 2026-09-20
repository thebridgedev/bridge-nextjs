/**
 * @jest-environment jsdom
 *
 * TBP-682 — MagicLink must redeem the emailed token, not only send it.
 *
 * auth-core posts `successUrl` = the page the request was made from, and Bridge
 * emails `{successUrl}?bridge_magic_link_token=<token>`. LoginForm has always
 * redeemed that token on mount; MagicLink only ever sent. So a request made
 * from a route that mounts MagicLink emailed a link back to that same route,
 * where nothing redeemed it: the page rendered, the token sat in the address
 * bar, and the user stayed signed out.
 *
 * Driven for real, like login-origin-error.test.tsx: the component is mounted
 * with react-dom against jsdom's own location/history, and the only stub is the
 * auth-core call the redeem ends in.
 */
import * as React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { HttpError, en } from '@nebulr-group/bridge-auth-core';

import { MagicLink } from './MagicLink';
import { getBridgeAuth, initBridge, _resetBridgeInstance } from '../../../core/bridge-instance';
import type { BridgeConfig } from '../../../shared/types/config';

const act = (React as unknown as { act: (cb: () => Promise<void> | void) => Promise<void> }).act;
const g = globalThis as unknown as Record<string, unknown>;

const realWarn = console.warn;
const realError = console.error;
beforeAll(() => {
  g.IS_REACT_ACT_ENVIRONMENT = true;
  console.warn = () => {};
  console.error = () => {};
});
afterAll(() => {
  console.warn = realWarn;
  console.error = realError;
});

let container: HTMLElement;
let root: Root | null = null;

beforeEach(() => {
  _resetBridgeInstance();
  initBridge({ appId: 'tbp-682', apiBaseUrl: 'http://127.0.0.1:1' } as unknown as BridgeConfig);
});

afterEach(async () => {
  const current = root;
  root = null;
  if (current) await act(async () => current.unmount());
  container?.remove();
  _resetBridgeInstance();
  window.history.replaceState({}, '', '/');
});

/** Serve the page from `pathAndQuery` — the URL the emailed link lands on. */
function servePage(pathAndQuery: string): void {
  window.history.replaceState({}, '', pathAndQuery);
}

async function mount(element: React.ReactElement): Promise<void> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(element);
  });
}

/** Let the redeem promise and its `.finally` settle, and React commit. */
async function flush(): Promise<void> {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

/** Stub the one auth-core call the redeem ends in. */
function stubRedeem(impl: (token: string) => Promise<unknown>) {
  return jest
    .spyOn(getBridgeAuth() as never, 'authenticateWithMagicLinkToken' as never)
    .mockImplementation(impl as never);
}

const alertText = () => container.querySelector('[role="alert"], .bridge-alert')?.textContent?.trim() ?? '';
const emailField = () => container.querySelector<HTMLInputElement>('#magic-email');
const submitButton = () => container.querySelector<HTMLButtonElement>('button[type="submit"]');

describe('MagicLink redeems the emailed token on mount (TBP-682)', () => {
  it('redeems the token in the URL and strips it from the address bar', async () => {
    servePage('/auth/magic-link?bridge_magic_link_token=tok-1&utm_source=email');
    const redeem = stubRedeem(async () => ({}));

    await mount(<MagicLink />);
    await flush();

    expect(redeem).toHaveBeenCalledTimes(1);
    expect(redeem).toHaveBeenCalledWith('tok-1');

    // The token is gone, the app's own query survives — a reload or a shared
    // link cannot replay it.
    expect(window.location.search).toBe('?utm_source=email');
    expect(window.location.pathname).toBe('/auth/magic-link');
    expect(alertText()).toBe('');
  });

  it('strips the whole query when the token was the only parameter', async () => {
    servePage('/auth/magic-link?bridge_magic_link_token=tok-2');
    const redeem = stubRedeem(async () => ({}));

    await mount(<MagicLink />);
    await flush();

    expect(redeem).toHaveBeenCalledTimes(1);
    expect(window.location.search).toBe('');
    expect(window.location.pathname).toBe('/auth/magic-link');
  });

  it('strips the token BEFORE redeeming, not after', async () => {
    // The strip is what makes the effect replay-safe, so it has to happen on
    // the way in, not in a `.then`. Asserted by reading the address bar from
    // inside the stub: by the time auth-core is called, the token is gone.
    servePage('/auth/magic-link?bridge_magic_link_token=tok-3');
    let searchDuringRedeem = 'unset';
    const redeem = stubRedeem(async () => {
      searchDuringRedeem = window.location.search;
      return {};
    });

    await mount(<MagicLink />);
    await flush();

    expect(redeem).toHaveBeenCalledTimes(1);
    expect(searchDuringRedeem).toBe('');
  });

  it('does nothing when there is no token — the send form renders as before', async () => {
    servePage('/auth/magic-link');
    const redeem = stubRedeem(async () => ({}));

    await mount(<MagicLink />);
    await flush();

    expect(redeem).not.toHaveBeenCalled();
    expect(emailField()).not.toBeNull();
    expect(submitButton()!.textContent).toContain(en['magicLink.submit']);
    expect(alertText()).toBe('');
  });

  it('leaves an unrelated query untouched when there is no token', async () => {
    servePage('/auth/magic-link?utm_source=email');
    const redeem = stubRedeem(async () => ({}));

    await mount(<MagicLink />);
    await flush();

    expect(redeem).not.toHaveBeenCalled();
    expect(window.location.search).toBe('?utm_source=email');
  });

  it('StrictMode double-invoke redeems exactly once', async () => {
    // React's dev double-mount runs the effect twice on the same fiber. No ref
    // guard is needed: the first run strips the token synchronously, so the
    // second finds none — the same shape LoginForm relies on.
    servePage('/auth/magic-link?bridge_magic_link_token=tok-4');
    const redeem = stubRedeem(async () => ({}));

    await mount(
      <React.StrictMode>
        <MagicLink />
      </React.StrictMode>,
    );
    await flush();

    expect(redeem).toHaveBeenCalledTimes(1);
    expect(redeem).toHaveBeenCalledWith('tok-4');
  });
});

describe('MagicLink surfaces a refused redeem (TBP-682)', () => {
  it('shows the error, calls onError, and leaves the loading state', async () => {
    servePage('/auth/magic-link?bridge_magic_link_token=expired');
    const refusal = new HttpError('This magic link has expired.', 401, {
      message: 'This magic link has expired.',
    });
    stubRedeem(async () => {
      throw refusal;
    });
    const onError = jest.fn();

    await mount(<MagicLink onError={onError} />);
    await flush();

    expect(alertText()).toBe('This magic link has expired.');
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(refusal);

    // Loading is over: the form is usable again, so the user can request a
    // fresh link from the same screen.
    expect(submitButton()!.textContent).toContain(en['magicLink.submit']);
    expect(emailField()!.disabled).toBe(false);
  });

  it('falls back to the magicLink.error.auth copy when the failure carries no message', async () => {
    servePage('/auth/magic-link?bridge_magic_link_token=nope');
    stubRedeem(async () => {
      throw new Error('');
    });
    const onError = jest.fn();

    await mount(<MagicLink onError={onError} />);
    await flush();

    expect(alertText()).toBe(en['magicLink.error.auth']);
    expect(onError).toHaveBeenCalledTimes(1);
  });
});
