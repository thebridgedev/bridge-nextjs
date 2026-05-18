'use client';

import type { HTMLAttributes } from 'react';
import { useState } from 'react';
import { getBridgeAuth } from '../../../core/bridge-instance';
import { AuthFormWrapper } from './shared/AuthFormWrapper';
import { Alert } from './shared/Alert';
import { Spinner } from './shared/Spinner';

interface Props extends Omit<HTMLAttributes<HTMLDivElement>, 'onError'> {
  onSent?: () => void;
  onError?: (error: Error) => void;
  loginHref?: string;
}

function formatExpiry(seconds: number): string {
  if (seconds >= 60) {
    const m = Math.floor(seconds / 60);
    return `${m} minute${m !== 1 ? 's' : ''}`;
  }
  return `${seconds} seconds`;
}

export function MagicLink({
  onSent,
  onError,
  loginHref = '/auth/login',
  className,
  style,
  ...rest
}: Props) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [expiresIn, setExpiresIn] = useState(0);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setError(null);
    setLoading(true);
    try {
      const result = await (getBridgeAuth() as any).sendMagicLink(email);
      setExpiresIn(result.expiresIn);
      setSent(true);
      onSent?.();
    } catch (err: any) {
      setError(err.message || 'Failed to send magic link.');
      onError?.(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthFormWrapper
      heading="Sign in with email link"
      className={className}
      style={style}
      {...rest}
    >
      {error && <Alert variant="error">{error}</Alert>}

      {sent ? (
        <>
          <Alert variant="success">
            Check your email — link expires in {formatExpiry(expiresIn)}.
          </Alert>
          {loginHref && (
            <div className="bridge-form-footer">
              <a href={loginHref}>Back to login</a>
            </div>
          )}
        </>
      ) : (
        <>
          <p className="bridge-step-desc">
            Enter your email and we'll send you a sign-in link. No password needed.
          </p>
          <form onSubmit={handleSend}>
            <div className="bridge-form-group">
              <label htmlFor="magic-email">Email</label>
              <input
                id="magic-email"
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
              {loading ? <Spinner size={16} /> : 'Send magic link'}
            </button>
          </form>
          {loginHref && (
            <div className="bridge-form-footer">
              <a href={loginHref}>Back to login</a>
            </div>
          )}
        </>
      )}
    </AuthFormWrapper>
  );
}

export default MagicLink;
