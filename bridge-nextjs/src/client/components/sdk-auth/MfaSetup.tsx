'use client';

import type { HTMLAttributes } from 'react';
import { useEffect, useState } from 'react';
import type { MessageKey, MessageOverrides } from '@nebulr-group/bridge-auth-core';
import { getBridgeAuth } from '../../../core/bridge-instance';
import { getTranslator } from '../../../i18n';
import { authErrorMessage } from './shared/auth-error';
import { AuthFormWrapper } from './shared/AuthFormWrapper';
import { Alert } from './shared/Alert';
import { Spinner } from './shared/Spinner';

interface Props extends Omit<HTMLAttributes<HTMLDivElement>, 'onError'> {
  onComplete?: () => void;
  onError?: (error: Error) => void;
  /** Heading text. Pass `null`/`''` to render no heading and use your own page title. */
  heading?: string | null;
  /**
   * Step description. Pass `null`/`''` to render nothing and use your own
   * subtitle (TBP-631).
   *
   * This component has THREE steps, each with its own description, but one
   * wrapper — so an override replaces whichever description is showing.
   */
  description?: string | null;
  /** Per-key copy overrides for this component only (TBP-630). */
  messages?: MessageOverrides;
}

// TBP-631 — the three step descriptions used to sit inline in the markup,
// outside AuthFormWrapper's heading guard, so `heading={null}` could not reach
// them. They live in one wrapper rather than three, so the wrapper cannot know
// the step — the component computes it and hands over the resolved value.
const STEP_DESCRIPTION_KEYS: Record<'phone' | 'verify' | 'backup', MessageKey> = {
  phone: 'mfaSetup.phoneDescription',
  verify: 'mfaSetup.verifyDescription',
  backup: 'mfaSetup.backupDescription',
};

export function MfaSetup({
  onComplete,
  onError,
  heading,
  description,
  messages,
  className,
  style,
  ...rest
}: Props) {
  const t = getTranslator(messages);
  const [step, setStep] = useState<'phone' | 'verify' | 'backup'>('phone');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [code, setCode] = useState('');
  const [backupCode, setBackupCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [resendCountdown, setResendCountdown] = useState(0);

  const wrapperHeading = heading !== undefined ? heading : t('mfaSetup.heading');
  // `undefined` = not overridden (use the built-in); `null` = host suppressed it.
  const wrapperDescription =
    description !== undefined ? description : t(STEP_DESCRIPTION_KEYS[step]);

  useEffect(() => {
    if (resendCountdown <= 0) return;
    const id = setInterval(() => setResendCountdown((v) => v - 1), 1000);
    return () => clearInterval(id);
  }, [resendCountdown]);

  async function handleSendCode(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setError(null);
    setLoading(true);
    try {
      await (getBridgeAuth() as any).setupMfa(phoneNumber);
      setStep('verify');
      setResendCountdown(60);
    } catch (err: any) {
      setError(authErrorMessage(err, t, 'mfaSetup.error.sendCode'));
      onError?.(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleResendCode() {
    if (loading || resendCountdown > 0) return;
    setError(null);
    setLoading(true);
    try {
      await (getBridgeAuth() as any).setupMfa(phoneNumber);
      setCode('');
      setResendCountdown(60);
    } catch (err: any) {
      setError(authErrorMessage(err, t, 'mfaSetup.error.resend'));
      onError?.(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyCode(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setError(null);
    setLoading(true);
    try {
      const result = await (getBridgeAuth() as any).confirmMfaSetup(code);
      setBackupCode(result.backupCode ?? null);
      setStep('backup');
    } catch (err: any) {
      setError(authErrorMessage(err, t, 'mfa.error.invalidCode'));
      onError?.(err);
    } finally {
      setLoading(false);
    }
  }

  async function copyBackupCode() {
    if (!backupCode) return;
    await navigator.clipboard.writeText(backupCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleDone() {
    await (getBridgeAuth() as any).completeMfaSetup();
    onComplete?.();
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

      {step === 'phone' && (
        <form onSubmit={handleSendCode}>
          <div className="bridge-form-group">
            <label htmlFor="mfa-phone">{t('field.phoneNumber')}</label>
            <input
              id="mfa-phone"
              type="tel"
              placeholder={t('placeholder.phoneNumber')}
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              disabled={loading}
            />
          </div>
          <button
            type="submit"
            className="bridge-btn bridge-btn-primary"
            disabled={loading || !phoneNumber.trim()}
          >
            {loading ? <Spinner size={16} /> : t('mfaSetup.sendCode')}
          </button>
        </form>
      )}

      {step === 'verify' && (
        <>
          <form onSubmit={handleVerifyCode}>
            <div className="bridge-form-group">
              <label htmlFor="mfa-verify-code">{t('field.verificationCode')}</label>
              <input
                id="mfa-verify-code"
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
              {loading ? <Spinner size={16} /> : t('mfaSetup.verify')}
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
                  onClick={handleResendCode}
                  disabled={loading}
                >
                  {t('action.resendCode')}
                </button>
                .
              </>
            )}
          </p>
          <button
            type="button"
            className="bridge-link"
            onClick={() => {
              setStep('phone');
              setCode('');
              setError(null);
              setResendCountdown(0);
            }}
          >
            {t('mfaSetup.changePhone')}
          </button>
        </>
      )}

      {step === 'backup' && (
        <>
          <Alert variant="success">{t('mfaSetup.successHeading')}</Alert>
          {backupCode && (
            <div className="bridge-backup-code">
              <code>{backupCode}</code>
              <button
                type="button"
                className="bridge-btn bridge-btn-secondary"
                onClick={copyBackupCode}
              >
                {copied ? t('action.copied') : t('action.copy')}
              </button>
            </div>
          )}
          <button
            type="button"
            className="bridge-btn bridge-btn-primary"
            onClick={handleDone}
          >
            {t('action.done')}
          </button>
        </>
      )}
    </AuthFormWrapper>
  );
}

export default MfaSetup;
