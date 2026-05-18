'use client';

import type { HTMLAttributes } from 'react';
import { useEffect, useState } from 'react';
import { getBridgeAuth } from '../../../core/bridge-instance';
import { AuthFormWrapper } from './shared/AuthFormWrapper';
import { Alert } from './shared/Alert';
import { Spinner } from './shared/Spinner';

interface Props extends Omit<HTMLAttributes<HTMLDivElement>, 'onError'> {
  onVerified?: () => void;
  onError?: (error: Error) => void;
  showRecoveryOption?: boolean;
}

export function MfaChallenge({
  onVerified,
  onError,
  showRecoveryOption = true,
  className,
  style,
  ...rest
}: Props) {
  const [code, setCode] = useState('');
  const [backupCode, setBackupCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [useRecovery, setUseRecovery] = useState(false);
  const [resendCountdown, setResendCountdown] = useState(0);

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
      setError(err.message || 'Failed to resend code.');
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
      setError(err.message || 'Invalid code. Please try again.');
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
      setError(err.message || 'Invalid recovery code.');
      onError?.(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthFormWrapper
      heading="Two-factor authentication"
      className={className}
      style={style}
      {...rest}
    >
      {error && <Alert variant="error">{error}</Alert>}

      {!useRecovery ? (
        <>
          <form onSubmit={handleVerify}>
            <div className="bridge-form-group">
              <label htmlFor="mfa-code">Authentication code</label>
              <input
                id="mfa-code"
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
                  onClick={handleResend}
                  disabled={loading}
                >
                  Resend code
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
                Use recovery code
              </button>
            </div>
          )}
        </>
      ) : (
        <>
          <form onSubmit={handleRecovery}>
            <div className="bridge-form-group">
              <label htmlFor="backup-code">Recovery code</label>
              <input
                id="backup-code"
                type="text"
                placeholder="Enter recovery code"
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
              {loading ? <Spinner size={16} /> : 'Recover'}
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
              Use authentication code
            </button>
          </div>
        </>
      )}
    </AuthFormWrapper>
  );
}

export default MfaChallenge;
