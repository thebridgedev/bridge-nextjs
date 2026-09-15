'use client';

import type { ButtonHTMLAttributes } from 'react';
import { useState } from 'react';
import type { MessageOverrides } from '@nebulr-group/bridge-auth-core';
import { getBridgeAuth } from '../../../core/bridge-instance';
import { getTranslator } from '../../../i18n';
import { authErrorMessage, isOriginNotAllowed } from './shared/auth-error';
import { Spinner } from './shared/Spinner';

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
      const result = await (getBridgeAuth() as any).authenticateWithPasskey();
      if (result?.type === 'auth_success' || result === undefined) {
        onLogin?.();
      } else if (result?.type === 'no_passkey') {
        if (onSetupPasskey) onSetupPasskey();
        else if (setupHref && typeof window !== 'undefined') {
          window.location.href = setupHref;
        }
      } else if (result?.type === 'auth_error') {
        throw new Error(result.error || t('passkey.error.auth'));
      }
    } catch (err: any) {
      const message = authErrorMessage(err, t, 'passkey.error.auth');
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
