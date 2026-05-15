'use client';

import type { HTMLAttributes } from 'react';
import { useState } from 'react';
import { getBridgeAuth } from '../../../core/bridge-instance';
import { AuthFormWrapper } from './shared/AuthFormWrapper';
import { Alert } from './shared/Alert';
import { Spinner } from './shared/Spinner';

interface Props extends Omit<HTMLAttributes<HTMLDivElement>, 'onError'> {
  initialEmail?: string;
  onSent?: () => void;
  onError?: (error: Error) => void;
  onBack?: () => void;
  loginHref?: string;
}

export function PasskeyRequestSetupLink({
  initialEmail = '',
  onSent,
  onError,
  onBack,
  loginHref = '/auth/login',
  className,
  style,
  ...rest
}: Props) {
  const [email, setEmail] = useState(initialEmail);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setError(null);
    setLoading(true);
    try {
      await (getBridgeAuth() as any).sendPasskeySetupLink(email);
      setSent(true);
      onSent?.();
    } catch (err: any) {
      setError(err.message || 'Failed to send passkey setup link.');
      onError?.(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthFormWrapper
      heading="Set up a passkey"
      className={className}
      style={style}
      {...rest}
    >
      {error && <Alert variant="error">{error}</Alert>}

      {sent ? (
        <>
          <Alert variant="success">
            Check your email — we sent a link to set up your passkey.
          </Alert>
          <div className="bridge-form-footer">
            {onBack ? (
              <button type="button" className="bridge-link" onClick={onBack}>
                Back to login
              </button>
            ) : (
              <a href={loginHref}>Back to login</a>
            )}
          </div>
        </>
      ) : (
        <>
          <p className="bridge-step-desc">
            Enter your email and we'll send you a link to set up a passkey for faster sign-in.
          </p>
          <form onSubmit={handleSubmit}>
            <div className="bridge-form-group">
              <label htmlFor="passkey-request-email">Email</label>
              <input
                id="passkey-request-email"
                type="email"
                placeholder="you@example.com"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
              />
            </div>
            <button
              type="submit"
              className="bridge-btn bridge-btn-primary"
              disabled={loading || !email.trim()}
            >
              {loading ? <Spinner size={16} /> : 'Send passkey setup link'}
            </button>
          </form>
          <div className="bridge-form-footer">
            {onBack ? (
              <button type="button" className="bridge-link" onClick={onBack}>
                Back to login
              </button>
            ) : (
              <a href={loginHref}>Back to login</a>
            )}
          </div>
        </>
      )}
    </AuthFormWrapper>
  );
}

export default PasskeyRequestSetupLink;
