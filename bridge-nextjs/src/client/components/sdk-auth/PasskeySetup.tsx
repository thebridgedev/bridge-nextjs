'use client';

import type { HTMLAttributes } from 'react';
import { useState } from 'react';
import { getBridgeAuth } from '../../../core/bridge-instance';
import { AuthFormWrapper } from './shared/AuthFormWrapper';
import { Alert } from './shared/Alert';
import { Spinner } from './shared/Spinner';

interface Props extends Omit<HTMLAttributes<HTMLDivElement>, 'onError'> {
  token: string;
  onComplete?: () => void;
  onError?: (error: Error) => void;
  loginHref?: string;
}

export function PasskeySetup({
  token,
  onComplete,
  onError,
  loginHref = '/auth/login',
  className,
  style,
  ...rest
}: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleRegister() {
    if (loading) return;
    setError(null);
    setLoading(true);
    try {
      await (getBridgeAuth() as any).registerPasskeyWithToken(token);
      setDone(true);
      onComplete?.();
    } catch (err: any) {
      setError(err.message || 'Failed to register passkey.');
      onError?.(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthFormWrapper
      heading="Set up your passkey"
      className={className}
      style={style}
      {...rest}
    >
      {error && <Alert variant="error">{error}</Alert>}

      {done ? (
        <>
          <Alert variant="success">Passkey registered. You can now sign in without a password.</Alert>
          <div className="bridge-form-footer">
            <a href={loginHref}>Continue to login</a>
          </div>
        </>
      ) : (
        <>
          <p className="bridge-step-desc">
            Click below to register a passkey with this device. You'll be able to sign in
            without a password from now on.
          </p>
          <button
            type="button"
            className="bridge-btn bridge-btn-primary"
            onClick={handleRegister}
            disabled={loading}
          >
            {loading ? <Spinner size={16} /> : 'Register passkey'}
          </button>
        </>
      )}
    </AuthFormWrapper>
  );
}

export default PasskeySetup;
