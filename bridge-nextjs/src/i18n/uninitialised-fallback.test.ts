/**
 * TBP-633 AC5 — `getTranslator()` must not throw when Bridge is uninitialised.
 *
 * `getBridgeConfig()` throws when `<BridgeProvider>` has not run. The SDK auth
 * components can render before that — a test harness, a stray import, a page
 * that mounts a login form outside the provider — and the deliberate choice is
 * that "a login form rendered in English is a far better failure than one that
 * throws". `getTranslator` wraps the config read in try/catch and returns the
 * default translator instead of propagating.
 *
 * Every other test in this package calls `boot()` / `initBridge()` before it
 * renders anything, so the catch branch was never entered. Deleting the
 * try/catch entirely would have left the suite green.
 *
 * This asserts the fallback RESOLVES REAL COPY, not merely that it did not
 * throw: a `createTranslator` handed a broken catalogue would also not throw,
 * and would echo raw keys back at the user.
 *
 * Isolation: `_resetBridgeInstance()` runs before AND after every case, so a
 * neighbour cannot hand this file an initialised config and the one case that
 * deliberately initialises cannot hand one to its neighbours. The final case
 * proves that round-trip rather than assuming it.
 */
import { en, sv } from '@nebulr-group/bridge-auth-core';

import { getTranslator } from './index';
import {
  getBridgeConfig,
  initBridge,
  _resetBridgeInstance,
} from '../core/bridge-instance';
import type { BridgeConfig } from '../shared/types/config';

// The one initialised case below kicks off a background app-config fetch at an
// unreachable apiBaseUrl and logs when it fails. That is noise, but noise that
// hides the next real warning.
const realWarn = console.warn;
beforeAll(() => {
  console.warn = () => {};
});
afterAll(() => {
  console.warn = realWarn;
});

beforeEach(() => {
  _resetBridgeInstance();
});

afterEach(() => {
  _resetBridgeInstance();
});

describe('getTranslator with no bridge config initialised (TBP-633)', () => {
  it('getBridgeConfig throws — the precondition these cases depend on', () => {
    // If initialisation ever stops throwing, the catch below becomes dead code
    // and the rest of this file would pass for the wrong reason.
    expect(() => getBridgeConfig()).toThrow(/not initialized/i);
  });

  it('returns a translator rather than propagating the throw', () => {
    expect(() => getTranslator()).not.toThrow();
  });

  it('resolves real English copy, not the raw key', () => {
    const t = getTranslator();
    expect(t('login.submit')).toBe(en['login.submit']);
    expect(t('field.email')).toBe(en['field.email']);
    expect(t('login.forgotPassword')).toBe(en['login.forgotPassword']);
    // The failure mode a bare "did not throw" assertion would miss.
    expect(t('login.submit')).not.toBe('login.submit');
  });

  it('interpolates parameters on the fallback path too', () => {
    const t = getTranslator();
    expect(t('mfa.resendCountdown', { seconds: 42 })).toBe(
      en['mfa.resendCountdown'].replace('{seconds}', '42'),
    );
    expect(t('mfa.resendCountdown', { seconds: 42 })).not.toContain('{seconds}');
  });

  it('still honours a per-component messages override', () => {
    // The override is the caller's own argument, not config, so it must
    // survive the config read failing.
    const t = getTranslator({ 'login.submit': 'Log me in' });
    expect(t('login.submit')).toBe('Log me in');
    // Un-overridden keys still come from the English catalogue.
    expect(t('field.email')).toBe(en['field.email']);
  });

  it('falls back to English specifically — no locale is readable without config', () => {
    const t = getTranslator();
    expect(t('login.submit')).not.toBe(sv['login.submit']);
  });
});

describe('fallback isolation (TBP-633)', () => {
  it('reads the configured locale once Bridge IS initialised', () => {
    // The mirror case: this is what the try branch does, and it is here so the
    // fallback above cannot be passing simply because config never works.
    initBridge({
      appId: 'tbp-633',
      apiBaseUrl: 'http://127.0.0.1:1',
      locale: 'sv',
    } as unknown as BridgeConfig);

    expect(getTranslator()('login.submit')).toBe(sv['login.submit']);
  });

  it('is back on the English fallback after the initialised case above', () => {
    // Depends on the afterEach reset actually working. If initialised config
    // leaked out of the previous case, this reads Swedish and fails here
    // rather than somewhere unrelated three files later.
    expect(() => getBridgeConfig()).toThrow(/not initialized/i);
    expect(getTranslator()('login.submit')).toBe(en['login.submit']);
  });
});
