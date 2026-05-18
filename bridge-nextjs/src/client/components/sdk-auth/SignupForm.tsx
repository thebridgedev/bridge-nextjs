'use client';

import type { HTMLAttributes, ReactNode } from 'react';
import { useState } from 'react';
import { getBridgeAuth } from '../../../core/bridge-instance';
import { AuthFormWrapper } from './shared/AuthFormWrapper';
import { Alert } from './shared/Alert';
import { Spinner } from './shared/Spinner';

interface Props extends Omit<HTMLAttributes<HTMLDivElement>, 'onError'> {
  onSignup?: () => void;
  onError?: (error: Error) => void;
  showLoginLink?: boolean;
  loginHref?: string;
  heading?: string;
  footer?: ReactNode;
}

export function SignupForm({
  onSignup,
  onError,
  showLoginLink = true,
  loginHref = '/auth/login',
  heading = 'Create your account',
  footer,
  className,
  style,
  ...rest
}: Props) {
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setError(null);
    setLoading(true);
    try {
      await getBridgeAuth().signup(email, firstName, lastName);
      setSuccess(true);
      onSignup?.();
    } catch (err: any) {
      setError(err.message || 'Failed to create account.');
      onError?.(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthFormWrapper heading={heading} className={className} style={style} {...rest}>
      {success ? (
        <>
          <h2 className="bridge-success-heading">Check your email</h2>
          <p className="bridge-step-desc">
            We sent a verification link to <strong>{email}</strong>. Check your inbox to
            activate your account.
          </p>
          {footer ??
            (showLoginLink && (
              <div className="bridge-form-footer">
                Already have an account? <a href={loginHref}>Log in</a>
              </div>
            ))}
        </>
      ) : (
        <>
          {error && <Alert variant="error">{error}</Alert>}

          <form onSubmit={handleSubmit}>
            <div className="bridge-form-group">
              <label htmlFor="signup-email">Email</label>
              <input
                id="signup-email"
                type="email"
                placeholder="you@example.com"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
              />
            </div>
            <div className="bridge-form-group">
              <label htmlFor="signup-first-name">First name</label>
              <input
                id="signup-first-name"
                type="text"
                placeholder="First name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                disabled={loading}
              />
            </div>
            <div className="bridge-form-group">
              <label htmlFor="signup-last-name">Last name</label>
              <input
                id="signup-last-name"
                type="text"
                placeholder="Last name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                disabled={loading}
              />
            </div>
            <button
              type="submit"
              className="bridge-btn bridge-btn-primary"
              disabled={loading || !email.trim()}
            >
              {loading ? <Spinner size={16} /> : 'Sign up'}
            </button>
          </form>

          {footer ??
            (showLoginLink && (
              <div className="bridge-form-footer">
                Already have an account? <a href={loginHref}>Log in</a>
              </div>
            ))}
        </>
      )}
    </AuthFormWrapper>
  );
}

export default SignupForm;
