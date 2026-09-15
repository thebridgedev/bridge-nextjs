'use client';

import type { HTMLAttributes } from 'react';
import { useState } from 'react';
import type { MessageOverrides } from '@nebulr-group/bridge-auth-core';
import { getBridgeAuth } from '../../../core/bridge-instance';
import { getTranslator } from '../../../i18n';
import { authErrorMessage } from './shared/auth-error';
import { AuthFormWrapper } from './shared/AuthFormWrapper';
import { Alert } from './shared/Alert';
import { Spinner } from './shared/Spinner';

interface Props extends Omit<HTMLAttributes<HTMLDivElement>, 'onError'> {
  token: string;
  onComplete?: () => void;
  onError?: (error: Error) => void;
  loginHref?: string;
  /** Heading text. Pass `null`/`''` to render no heading and use your own page title. */
  heading?: string | null;
  /**
   * Step description. Pass `null`/`''` to render nothing and use your own
   * subtitle (TBP-631).
   *
   * The built-in is `passkey.setupClickPrompt`, not `passkey.setupDescription`:
   * this screen waits for a click before it raises the browser ceremony, so the
   * "follow the prompt from your browser" copy would be describing something
   * that has not started (TBP-633).
   */
  description?: string | null;
  /** Per-key copy overrides for this component only (TBP-630). */
  messages?: MessageOverrides;
}

export function PasskeySetup({
  token,
  onComplete,
  onError,
  loginHref = '/auth/login',
  heading,
  description,
  messages,
  className,
  style,
  ...rest
}: Props) {
  const t = getTranslator(messages);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const builtInHeading = done ? t('passkey.setupSuccessHeading') : t('passkey.setupHeading');
  const wrapperHeading = heading !== undefined ? heading : builtInHeading;
  // Only the pre-click view has a description; the success view's copy is the
  // Alert below it.
  const wrapperDescription = done
    ? null
    : description !== undefined
      ? description
      : t('passkey.setupClickPrompt');

  async function handleRegister() {
    if (loading) return;
    setError(null);
    setLoading(true);
    try {
      await (getBridgeAuth() as any).registerPasskeyWithToken(token);
      setDone(true);
      onComplete?.();
    } catch (err: any) {
      setError(authErrorMessage(err, t, 'passkey.error.setupFailed'));
      onError?.(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthFormWrapper
      heading={wrapperHeading}
      description={wrapperDescription}
      className={className}
      style={style}
      {...rest}
    >
      {error && <Alert variant="error">{error}</Alert>}

      {done ? (
        <>
          <Alert variant="success">{t('passkey.setupSuccessDescription')}</Alert>
          <div className="bridge-form-footer">
            <a href={loginHref}>{t('passkey.signInNow')}</a>
          </div>
        </>
      ) : (
        <button
          type="button"
          className="bridge-btn bridge-btn-primary"
          onClick={handleRegister}
          disabled={loading}
        >
          {loading ? <Spinner size={16} /> : t('passkey.setupSubmit')}
        </button>
      )}
    </AuthFormWrapper>
  );
}

export default PasskeySetup;
