'use client';

import type { ButtonHTMLAttributes } from 'react';
import { useState } from 'react';
import { getBridgeAuth } from '../../../core/bridge-instance';
import { Spinner } from './shared/Spinner';

interface Props extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onError'> {
  onLogin?: () => void;
  onError?: (error: Error) => void;
  onSetupPasskey?: () => void;
  setupHref?: string;
  label?: string;
}

export function PasskeyLogin({
  onLogin,
  onError,
  onSetupPasskey,
  setupHref,
  label = 'Continue with passkey',
  className,
  style,
  ...rest
}: Props) {
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
        throw new Error(result.error || 'Passkey login failed');
      }
    } catch (err: any) {
      onError?.(new Error(err.message || 'Passkey login failed'));
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
      <span>{label}</span>
    </button>
  );
}

export default PasskeyLogin;
