'use client';

import type { FederationConnection, MessageOverrides } from '@nebulr-group/bridge-auth-core';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { useState } from 'react';
import { getBridgeAuth } from '../../../core/bridge-instance';
import { Spinner } from './shared/Spinner';
import { getTranslator } from '../../../i18n';

interface Props extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onError'> {
  connection: FederationConnection;
  label?: string;
  mode?: 'redirect' | 'popup';
  onSuccess?: () => void;
  onError?: (error: Error) => void;
  icon?: ReactNode;
  /** Per-key copy overrides for this component only (TBP-630). */
  messages?: MessageOverrides;
}

export function SsoButton({
  connection,
  label,
  mode = 'redirect',
  onSuccess,
  onError,
  icon,
  messages,
  className,
  style,
  ...rest
}: Props) {
  const t = getTranslator(messages);
  const [loading, setLoading] = useState(false);
  // `label` still wins: an app naming its own provider button is voice, not
  // mechanics, and the catalogue only supplies the default (TBP-634).
  const buttonLabel = label ?? t('sso.continueWith', { provider: connection.name });

  async function handleClick() {
    if (loading) return;
    setLoading(true);
    try {
      const result = await (getBridgeAuth() as any).startSsoLogin(connection.type, { mode });
      if (result.type === 'auth_success') {
        onSuccess?.();
      } else if (result.type === 'auth_error') {
        throw new Error(result.error || t('sso.error.login'));
      }
    } catch (err: any) {
      const message = err.message?.includes('popup')
        ? t('sso.error.popupBlocked')
        : err.message || t('sso.error.login');
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
