'use client';

import type { ButtonHTMLAttributes } from 'react';
import { useState } from 'react';
import type { MessageOverrides } from '@nebulr-group/bridge-auth-core';
import { getBridgeAuth } from '../../../core/bridge-instance';
import { getTranslator } from '../../../i18n';
import { authErrorMessage, isOriginNotAllowed } from './shared/auth-error';
import { Spinner } from './shared/Spinner';
import { passkeysSupported, startPasskeyAuthentication } from './shared/webauthn';

interface Props extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onError'> {
  onLogin?: () => void;
  onError?: (error: Error) => void;
  onSetupPasskey?: () => void;
  setupHref?: string;
  /** Button label. Defaults to the catalogue's `passkey.loginButton`. */
  label?: string;
  /** Per-key copy overrides for this component only (TBP-630). */
  messages?: MessageOverrides;
}

export function PasskeyLogin({
  onLogin,
  onError,
  onSetupPasskey,
  setupHref,
  label,
  messages,
  className,
  style,
  ...rest
}: Props) {
  const t = getTranslator(messages);
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    if (loading) return;
    setLoading(true);
    try {
      if (!passkeysSupported()) throw new Error(t('passkey.error.unsupported'));
      const auth = getBridgeAuth();
      const options = await auth.getPasskeyAuthOptions();
      const response = await startPasskeyAuthentication(options);
      await auth.authenticateWithPasskey(response);
      // MFA or a workspace choice may still be pending; LoginForm moves on from
      // the auth state. Only a finished sign-in is a login.
      if (auth.isAuthenticated()) onLogin?.();
    } catch (err: any) {
      // The browser has no passkey for this site (or the person dismissed the
      // prompt): offer setup when the app wired it.
      if (err?.name === 'NotAllowedError' && (onSetupPasskey || setupHref)) {
        if (onSetupPasskey) onSetupPasskey();
        else if (setupHref && typeof window !== 'undefined') window.location.href = setupHref;
        return;
      }
      const message =
        err?.name === 'NotAllowedError'
          ? t('passkey.error.authCancelled')
          : authErrorMessage(err, t, 'passkey.error.auth');
      // TBP-669: an origin refusal is handed on as-is (status 403 and body
      // intact) so LoginForm can recognise it and show the fix.
      onError?.(isOriginNotAllowed(err) ? err : new Error(message));
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      className={className}
      style={style}
      data-bridge-passkey-login
      data-loading={loading}
      onClick={handleClick}
      disabled={loading}
      {...rest}
    >
      {loading ? <Spinner size={16} /> : null}
      <span>{label ?? t('passkey.loginButton')}</span>
    </button>
  );
}

export default PasskeyLogin;
