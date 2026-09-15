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
  /** When provided, switches to "set new password" mode. */
  token?: string;
  onComplete?: () => void;
  onError?: (error: Error) => void;
  loginHref?: string;
  /** Heading text. Pass `null`/`''` to render no heading and use your own page title. */
  heading?: string | null;
  /** Step description. Pass `null`/`''` to render nothing and use your own subtitle (TBP-631). */
  description?: string | null;
  /** Per-key copy overrides for this component only (TBP-630). */
  messages?: MessageOverrides;
}

export function ForgotPassword({
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
  const isSetMode = !!token;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState(false);
  const [passwordReset, setPasswordReset] = useState(false);
  const [showPasswords, setShowPasswords] = useState(false);

  const builtInHeading = isSetMode ? t('forgot.headingSet') : t('forgot.headingRequest');
  const wrapperHeading =
    passwordReset || emailSent ? null : heading !== undefined ? heading : builtInHeading;

  // TBP-631 — same shape as the heading above: the description belongs to the
  // send-link step only. `undefined` means "not overridden" and falls through to
  // the built-in; `null` is an explicit suppression from the host and must be
  // respected, which is why this cannot collapse to `description ?? builtIn`.
  const wrapperDescription =
    isSetMode || passwordReset || emailSent
      ? null
      : description !== undefined
        ? description
        : t('forgot.description');

  async function handleSendLink(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setError(null);
    setLoading(true);
    try {
      await getBridgeAuth().sendResetPasswordLink(email);
      setEmailSent(true);
    } catch (err: any) {
      setError(authErrorMessage(err, t, 'forgot.error.send'));
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
      setError(t('forgot.error.mismatch'));
      return;
    }
    if (password.length < 8) {
      setError(t('forgot.error.tooShort'));
      return;
    }

    setLoading(true);
    try {
      await (getBridgeAuth() as any).updatePassword(token!, password);
      setPasswordReset(true);
      onComplete?.();
    } catch (err: any) {
      setError(authErrorMessage(err, t, 'forgot.error.update'));
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

      {isSetMode ? (
        passwordReset ? (
          <>
            <h2 className="bridge-success-heading">{t('forgot.successHeading')}</h2>
            <div className="bridge-form-footer">
              <a href={loginHref}>{t('action.backToLogin')}</a>
            </div>
          </>
        ) : (
          <form onSubmit={handleSetPassword}>
            <div className="bridge-form-group">
              <label htmlFor="newPassword">{t('field.newPassword')}</label>
              <div className="bridge-password-wrapper">
                <input
                  id="newPassword"
                  type={showPasswords ? 'text' : 'password'}
                  placeholder={t('placeholder.newPassword')}
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
                  aria-label={
                    showPasswords ? t('action.hidePasswords') : t('action.showPasswords')
                  }
                >
                  {showPasswords ? '🙈' : '👁'}
                </button>
              </div>
            </div>
            <div className="bridge-form-group">
              <label htmlFor="confirmPassword">{t('field.confirmPassword')}</label>
              <input
                id="confirmPassword"
                type={showPasswords ? 'text' : 'password'}
                placeholder={t('placeholder.confirmPassword')}
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
              {loading ? <Spinner size={16} /> : t('forgot.setSubmit')}
            </button>
          </form>
        )
      ) : emailSent ? (
        <>
          <Alert variant="success">{t('forgot.emailSent')}</Alert>
          <div className="bridge-form-footer">
            <a href={loginHref}>{t('action.backToLogin')}</a>
          </div>
        </>
      ) : (
        <>
          <form onSubmit={handleSendLink}>
            <div className="bridge-form-group">
              <label htmlFor="reset-email">{t('field.email')}</label>
              <input
                id="reset-email"
                type="email"
                placeholder={t('placeholder.email')}
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
              {loading ? <Spinner size={16} /> : t('forgot.submit')}
            </button>
          </form>
          <div className="bridge-form-footer">
            <a href={loginHref}>{t('action.backToLogin')}</a>
          </div>
        </>
      )}
    </AuthFormWrapper>
  );
}

export default ForgotPassword;
