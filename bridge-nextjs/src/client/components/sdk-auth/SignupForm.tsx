'use client';

import type { HTMLAttributes, ReactNode } from 'react';
import { useState } from 'react';
import type { MessageOverrides } from '@nebulr-group/bridge-auth-core';
import { getBridgeAuth } from '../../../core/bridge-instance';
import { getTranslator } from '../../../i18n';
import { AuthFormWrapper } from './shared/AuthFormWrapper';
import { Alert } from './shared/Alert';
import { Spinner } from './shared/Spinner';

interface Props extends Omit<HTMLAttributes<HTMLDivElement>, 'onError'> {
  onSignup?: () => void;
  onError?: (error: Error) => void;
  showLoginLink?: boolean;
  loginHref?: string;
  /** Heading text. Pass `null`/`''` to render no heading and use your own page title. */
  heading?: string | null;
  /**
   * Success-state description. Pass `null`/`''` to render nothing (TBP-631).
   *
   * NOT lifted into AuthFormWrapper, unlike most of the other components: it
   * belongs under the "Check your email" heading, which is rendered inside the
   * wrapper's children rather than as the wrapper heading. Hoisting it would
   * print the description above the heading it belongs to.
   */
  description?: string | null;
  footer?: ReactNode;
  /** Per-key copy overrides for this component only (TBP-630). */
  messages?: MessageOverrides;
}

export function SignupForm({
  onSignup,
  onError,
  showLoginLink = true,
  loginHref = '/auth/login',
  heading,
  description,
  footer,
  messages,
  className,
  style,
  ...rest
}: Props) {
  const t = getTranslator(messages);
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const wrapperHeading = heading !== undefined ? heading : t('signup.heading');

  // The catalogue holds the whole sentence with an `{email}` placeholder so a
  // locale can put the address wherever it belongs; the split below runs on the
  // already-translated string purely to wrap it in `<strong>`.
  const successDescriptionParts = t('signup.successDescription').split('{email}');

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
      setError(err.message || t('signup.error.create'));
      onError?.(err);
    } finally {
      setLoading(false);
    }
  }

  const loginFooter = footer ?? (
    showLoginLink && (
      <div className="bridge-form-footer">
        {t('signup.loginPrompt')} <a href={loginHref}>{t('signup.loginLink')}</a>
      </div>
    )
  );

  return (
    // In the success state the "Check your email" heading below is the title, so
    // suppress the form heading to avoid two stacked headings.
    <AuthFormWrapper
      heading={success ? null : wrapperHeading}
      className={className}
      style={style}
      {...rest}
    >
      {success ? (
        <>
          <h2 className="bridge-success-heading">{t('signup.successHeading')}</h2>
          {description === undefined ? (
            <p className="bridge-step-desc">
              {successDescriptionParts[0]}
              <strong>{email}</strong>
              {successDescriptionParts[1] ?? ''}
            </p>
          ) : description ? (
            <p className="bridge-step-desc">{description}</p>
          ) : null}
          {loginFooter}
        </>
      ) : (
        <>
          {error && <Alert variant="error">{error}</Alert>}

          <form onSubmit={handleSubmit}>
            <div className="bridge-form-group">
              <label htmlFor="signup-email">{t('field.email')}</label>
              <input
                id="signup-email"
                type="email"
                placeholder={t('placeholder.email')}
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
              />
            </div>
            <div className="bridge-form-group">
              <label htmlFor="signup-first-name">{t('field.firstName')}</label>
              <input
                id="signup-first-name"
                type="text"
                placeholder={t('placeholder.firstName')}
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                disabled={loading}
              />
            </div>
            <div className="bridge-form-group">
              <label htmlFor="signup-last-name">{t('field.lastName')}</label>
              <input
                id="signup-last-name"
                type="text"
                placeholder={t('placeholder.lastName')}
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
              {loading ? <Spinner size={16} /> : t('signup.submit')}
            </button>
          </form>

          {loginFooter}
        </>
      )}
    </AuthFormWrapper>
  );
}

export default SignupForm;
