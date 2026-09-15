'use client';

import type { HTMLAttributes } from 'react';
import { useEffect, useState } from 'react';
import type { MessageOverrides } from '@nebulr-group/bridge-auth-core';
import { getBridgeAuth } from '../../../core/bridge-instance';
import { getTranslator } from '../../../i18n';
import { authErrorMessage } from './shared/auth-error';
import { AuthFormWrapper } from './shared/AuthFormWrapper';
import { Alert } from './shared/Alert';
import { Spinner } from './shared/Spinner';

interface Props extends Omit<HTMLAttributes<HTMLDivElement>, 'onError'> {
  onVerified?: () => void;
  onError?: (error: Error) => void;
  showRecoveryOption?: boolean;
  /** Heading text. Pass `null`/`''` to render no heading and use your own page title. */
  heading?: string | null;
  /** Per-key copy overrides for this component only (TBP-630). */
  messages?: MessageOverrides;
}

export function MfaChallenge({
  onVerified,
  onError,
  showRecoveryOption = true,
  heading,
  messages,
  className,
  style,
  ...rest
}: Props) {
  const t = getTranslator(messages);
  const [code, setCode] = useState('');
  const [backupCode, setBackupCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [useRecovery, setUseRecovery] = useState(false);
  const [resendCountdown, setResendCountdown] = useState(0);

  const wrapperHeading = heading !== undefined ? heading : t('mfa.challengeHeading');

  useEffect(() => {
    if (resendCountdown <= 0) return;
    const id = setInterval(() => setResendCountdown((v) => v - 1), 1000);
    return () => clearInterval(id);
  }, [resendCountdown]);

  async function handleResend() {
    if (loading || resendCountdown > 0) return;
    setError(null);
    setLoading(true);
    try {
      await (getBridgeAuth() as any).resendMfaCode();
      setCode('');
      setResendCountdown(60);
    } catch (err: any) {
      setError(authErrorMessage(err, t, 'mfa.error.resend'));
      onError?.(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setError(null);
    setLoading(true);
    try {
      await (getBridgeAuth() as any).verifyMfa(code);
      onVerified?.();
    } catch (err: any) {
      setError(authErrorMessage(err, t, 'mfa.error.invalidCode'));
      onError?.(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleRecovery(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setError(null);
    setLoading(true);
    try {
      await (getBridgeAuth() as any).resetMfa(backupCode);
      onVerified?.();
    } catch (err: any) {
      setError(authErrorMessage(err, t, 'mfa.error.invalidRecoveryCode'));
      onError?.(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthFormWrapper
      heading={wrapperHeading}
      className={className}
      style={style}
      {...rest}
    >
      {error && <Alert variant="error">{error}</Alert>}

      {!useRecovery ? (
        <>
          <form onSubmit={handleVerify}>
            <div className="bridge-form-group">
              <label htmlFor="mfa-code">{t('field.authenticationCode')}</label>
              <input
                id="mfa-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder={t('placeholder.sixDigitCode')}
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                disabled={loading}
              />
            </div>
            <button
              type="submit"
              className="bridge-btn bridge-btn-primary"
              disabled={loading || code.length < 6}
            >
              {loading ? <Spinner size={16} /> : t('mfa.submit')}
            </button>
          </form>
          <p className="bridge-mfa-help">
            {resendCountdown > 0 ? (
              t('mfa.resendCountdown', { seconds: resendCountdown })
            ) : (
              <>
                {t('mfa.resendPrompt')}{' '}
                <button
                  type="button"
                  className="bridge-link"
                  onClick={handleResend}
                  disabled={loading}
                >
                  {t('action.resendCode')}
                </button>
                .
              </>
            )}
          </p>
          {showRecoveryOption && (
            <div className="bridge-form-footer">
              <button
                type="button"
                className="bridge-link"
                onClick={() => {
                  setUseRecovery(true);
                  setError(null);
                }}
              >
                {t('mfa.useRecoveryCode')}
              </button>
            </div>
          )}
        </>
      ) : (
        <>
          <form onSubmit={handleRecovery}>
            <div className="bridge-form-group">
              <label htmlFor="backup-code">{t('field.recoveryCode')}</label>
              <input
                id="backup-code"
                type="text"
                placeholder={t('placeholder.recoveryCode')}
                value={backupCode}
                onChange={(e) => setBackupCode(e.target.value)}
                disabled={loading}
              />
            </div>
            <button
              type="submit"
              className="bridge-btn bridge-btn-primary"
              disabled={loading || !backupCode.trim()}
            >
              {loading ? <Spinner size={16} /> : t('mfa.recoverSubmit')}
            </button>
          </form>
          <div className="bridge-form-footer">
            <button
              type="button"
              className="bridge-link"
              onClick={() => {
                setUseRecovery(false);
                setError(null);
              }}
            >
              {t('mfa.useAuthenticationCode')}
            </button>
          </div>
        </>
      )}
    </AuthFormWrapper>
  );
}

export default MfaChallenge;
