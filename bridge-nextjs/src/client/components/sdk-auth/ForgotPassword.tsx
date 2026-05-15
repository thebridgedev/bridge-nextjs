'use client';

import type { HTMLAttributes } from 'react';
import { useState } from 'react';
import { getBridgeAuth } from '../../../core/bridge-instance';
import { AuthFormWrapper } from './shared/AuthFormWrapper';
import { Alert } from './shared/Alert';
import { Spinner } from './shared/Spinner';

interface Props extends Omit<HTMLAttributes<HTMLDivElement>, 'onError'> {
  /** When provided, switches to "set new password" mode. */
  token?: string;
  onComplete?: () => void;
  onError?: (error: Error) => void;
  loginHref?: string;
}

export function ForgotPassword({
  token,
  onComplete,
  onError,
  loginHref = '/auth/login',
  className,
  style,
  ...rest
}: Props) {
  const isSetMode = !!token;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState(false);
  const [passwordReset, setPasswordReset] = useState(false);
  const [showPasswords, setShowPasswords] = useState(false);

  async function handleSendLink(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setError(null);
    setLoading(true);
    try {
      await getBridgeAuth().sendResetPasswordLink(email);
      setEmailSent(true);
    } catch (err: any) {
      setError(err.message || 'Failed to send reset link.');
      onError?.(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setError(null);

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    setLoading(true);
    try {
      await (getBridgeAuth() as any).updatePassword(token!, password);
      setPasswordReset(true);
      onComplete?.();
    } catch (err: any) {
      setError(err.message || 'Failed to update password.');
      onError?.(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthFormWrapper
      heading={isSetMode ? 'Set new password' : 'Reset your password'}
      className={className}
      style={style}
      {...rest}
    >
      {error && <Alert variant="error">{error}</Alert>}

      {isSetMode ? (
        passwordReset ? (
          <>
            <h2 className="bridge-success-heading">Password set</h2>
            <div className="bridge-form-footer">
              <a href={loginHref}>Back to login</a>
            </div>
          </>
        ) : (
          <form onSubmit={handleSetPassword}>
            <div className="bridge-form-group">
              <label htmlFor="newPassword">New password</label>
              <div className="bridge-password-wrapper">
                <input
                  id="newPassword"
                  type={showPasswords ? 'text' : 'password'}
                  placeholder="At least 8 characters"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                />
                <button
                  type="button"
                  className="bridge-password-toggle"
                  onClick={() => setShowPasswords((v) => !v)}
                  tabIndex={-1}
                >
                  {showPasswords ? '🙈' : '👁'}
                </button>
              </div>
            </div>
            <div className="bridge-form-group">
              <label htmlFor="confirmPassword">Confirm password</label>
              <input
                id="confirmPassword"
                type={showPasswords ? 'text' : 'password'}
                placeholder="Repeat password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={loading}
              />
            </div>
            <button
              type="submit"
              className="bridge-btn bridge-btn-primary"
              disabled={loading || !password}
            >
              {loading ? <Spinner size={16} /> : 'Set a password'}
            </button>
          </form>
        )
      ) : emailSent ? (
        <>
          <Alert variant="success">Check your email for a password reset link.</Alert>
          <div className="bridge-form-footer">
            <a href={loginHref}>Back to login</a>
          </div>
        </>
      ) : (
        <>
          <p className="bridge-step-desc">
            Enter your email and we'll send you a link to reset your password.
          </p>
          <form onSubmit={handleSendLink}>
            <div className="bridge-form-group">
              <label htmlFor="reset-email">Email</label>
              <input
                id="reset-email"
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
              {loading ? <Spinner size={16} /> : 'Send reset link'}
            </button>
          </form>
          <div className="bridge-form-footer">
            <a href={loginHref}>Back to login</a>
          </div>
        </>
      )}
    </AuthFormWrapper>
  );
}

export default ForgotPassword;
