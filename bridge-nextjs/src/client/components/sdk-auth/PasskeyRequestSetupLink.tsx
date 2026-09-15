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
  initialEmail?: string;
  onSent?: () => void;
  onError?: (error: Error) => void;
  onBack?: () => void;
  loginHref?: string;
  /** Heading text. Pass `null`/`''` to render no heading and use your own page title. */
  heading?: string | null;
  /**
   * Step description. Pass `null`/`''` to render nothing and use your own
   * subtitle (TBP-631). Applies to whichever view is showing; the two views
   * have different built-in copy, and the 'sent' one carries markup, so a
   * string override replaces both with the same sentence.
   */
  description?: string | null;
  /** Per-key copy overrides for this component only (TBP-630). */
  messages?: MessageOverrides;
}

export function PasskeyRequestSetupLink({
  initialEmail = '',
  onSent,
  onError,
  onBack,
  loginHref = '/auth/login',
  heading,
  description,
  messages,
  className,
  style,
  ...rest
}: Props) {
  const t = getTranslator(messages);
  const [email, setEmail] = useState(initialEmail);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const builtInHeading = sent ? t('passkey.sentHeading') : t('passkey.createHeading');
  const wrapperHeading = heading !== undefined ? heading : builtInHeading;

  // The catalogue holds the whole sentence with a `{email}` placeholder so a
  // locale can put the address wherever it belongs; the split below runs on the
  // already-translated string purely to wrap it in `<strong>`.
  const sentDescriptionParts = t('passkey.sentDescription').split('{email}');
  const sentDescriptionSlot = (
    <p className="bridge-step-desc">
      {sentDescriptionParts[0]}
      <strong>{email}</strong>
      {sentDescriptionParts[1] ?? ''}
    </p>
  );

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
      setError(authErrorMessage(err, t, 'passkey.error.sendLink'));
      onError?.(err);
    } finally {
      setLoading(false);
    }
  }

  const backLink = onBack ? (
    <button type="button" className="bridge-link" onClick={onBack}>
      {t('action.backToLogin')}
    </button>
  ) : (
    <a href={loginHref}>{t('action.backToLogin')}</a>
  );

  if (sent) {
    return (
      <AuthFormWrapper
        heading={wrapperHeading}
        description={description === undefined ? undefined : description}
        descriptionSlot={description === undefined ? sentDescriptionSlot : undefined}
        className={className}
        style={style}
        {...rest}
      >
        <div className="bridge-form-footer">{backLink}</div>
      </AuthFormWrapper>
    );
  }

  return (
    <AuthFormWrapper
      heading={wrapperHeading}
      description={description === undefined ? t('passkey.requestDescription') : description}
      className={className}
      style={style}
      {...rest}
    >
      {error && <Alert variant="error">{error}</Alert>}

      <form onSubmit={handleSubmit}>
        <div className="bridge-form-group">
          <label htmlFor="passkey-request-email">{t('field.email')}</label>
          <input
            id="passkey-request-email"
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
          {loading ? <Spinner size={16} /> : t('passkey.requestSubmit')}
        </button>
      </form>
      <div className="bridge-form-footer">{backLink}</div>
    </AuthFormWrapper>
  );
}

export default PasskeyRequestSetupLink;
