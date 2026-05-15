'use client';

import type { FederationConnection } from '@nebulr-group/bridge-auth-core';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { useState } from 'react';
import { getBridgeAuth } from '../../../core/bridge-instance';
import { Spinner } from './shared/Spinner';

interface Props extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onError'> {
  connection: FederationConnection;
  label?: string;
  mode?: 'redirect' | 'popup';
  onSuccess?: () => void;
  onError?: (error: Error) => void;
  icon?: ReactNode;
}

export function SsoButton({
  connection,
  label,
  mode = 'redirect',
  onSuccess,
  onError,
  icon,
  className,
  style,
  ...rest
}: Props) {
  const [loading, setLoading] = useState(false);
  const buttonLabel = label ?? `Continue with ${connection.name}`;

  async function handleClick() {
    if (loading) return;
    setLoading(true);
    try {
      const result = await (getBridgeAuth() as any).startSsoLogin(connection.type, { mode });
      if (result.type === 'auth_success') {
        onSuccess?.();
      } else if (result.type === 'auth_error') {
        throw new Error(result.error || 'SSO login failed');
      }
    } catch (err: any) {
      const message = err.message?.includes('popup')
        ? 'Pop-up was blocked. Please allow pop-ups and try again.'
        : err.message || 'SSO login failed';
      onError?.(new Error(message));
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      className={className}
      style={style}
      data-bridge-sso-button
      data-loading={loading}
      onClick={handleClick}
      disabled={loading}
      {...rest}
    >
      <span className="bridge-sso-btn-inner">
        {loading ? <Spinner size={16} /> : icon ?? null}
        <span>{buttonLabel}</span>
      </span>
    </button>
  );
}

export default SsoButton;
