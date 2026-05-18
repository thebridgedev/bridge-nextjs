'use client';

import type { HTMLAttributes } from 'react';
import { useEffect, useState } from 'react';
import { getBridgeAuth } from '../../../core/bridge-instance';
import { AuthFormWrapper } from './shared/AuthFormWrapper';
import { Alert } from './shared/Alert';
import { Spinner } from './shared/Spinner';

interface Props extends Omit<HTMLAttributes<HTMLDivElement>, 'onError'> {
  onComplete?: () => void;
  onError?: (error: Error) => void;
}

export function MfaSetup({ onComplete, onError, className, style, ...rest }: Props) {
  const [step, setStep] = useState<'phone' | 'verify' | 'backup'>('phone');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [code, setCode] = useState('');
  const [backupCode, setBackupCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [resendCountdown, setResendCountdown] = useState(0);

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
      setError(err.message || 'Failed to send verification code.');
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
      setError(err.message || 'Failed to resend verification code.');
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
      setError(err.message || 'Invalid code. Please try again.');
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
      heading="Set up two-factor authentication"
      className={className}
      style={style}
      {...rest}
    >
      {error && <Alert variant="error">{error}</Alert>}

      {step === 'phone' && (
        <>
          <p className="bridge-step-desc">
            Enter your phone number to receive a verification code via SMS.
          </p>
          <form onSubmit={handleSendCode}>
            <div className="bridge-form-group">
              <label htmlFor="mfa-phone">Phone number</label>
              <input
                id="mfa-phone"
                type="tel"
                placeholder="+1 (555) 000-0000"
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
              {loading ? <Spinner size={16} /> : 'Send code'}
            </button>
          </form>
        </>
      )}

      {step === 'verify' && (
        <>
          <p className="bridge-step-desc">Enter the 6-digit code sent to your phone.</p>
          <form onSubmit={handleVerifyCode}>
            <div className="bridge-form-group">
              <label htmlFor="mfa-verify-code">Verification code</label>
              <input
                id="mfa-verify-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="Enter 6-digit code"
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
              {loading ? <Spinner size={16} /> : 'Verify'}
            </button>
          </form>
          <p className="bridge-mfa-help">
            {resendCountdown > 0 ? (
              `Didn't get your text message? You can resend in ${resendCountdown}s.`
            ) : (
              <>
                Didn't get your text message?{' '}
                <button
                  type="button"
                  className="bridge-link"
                  onClick={handleResendCode}
                  disabled={loading}
                >
                  Resend code
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
            Change phone number
          </button>
        </>
      )}

      {step === 'backup' && (
        <>
          <Alert variant="success">Two-factor authentication enabled!</Alert>
          <p className="bridge-step-desc">
            Save this recovery code in a safe place. You can use it to access your account if
            you lose your phone.
          </p>
          {backupCode && (
            <div className="bridge-backup-code">
              <code>{backupCode}</code>
              <button
                type="button"
                className="bridge-btn bridge-btn-secondary"
                onClick={copyBackupCode}
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
          )}
          <button
            type="button"
            className="bridge-btn bridge-btn-primary"
            onClick={handleDone}
          >
            Done
          </button>
        </>
      )}
    </AuthFormWrapper>
  );
}

export default MfaSetup;
