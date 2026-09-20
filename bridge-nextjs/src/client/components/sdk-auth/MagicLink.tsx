'use client';

import type { HTMLAttributes } from 'react';
import { useEffect, useState } from 'react';
import type { MessageOverrides, Translator } from '@nebulr-group/bridge-auth-core';
import { getBridgeAuth } from '../../../core/bridge-instance';
import { getTranslator } from '../../../i18n';
import { authErrorMessage } from './shared/auth-error';
import { AuthFormWrapper } from './shared/AuthFormWrapper';
import { Alert } from './shared/Alert';
import { Spinner } from './shared/Spinner';

interface Props extends Omit<HTMLAttributes<HTMLDivElement>, 'onError'> {
  onSent?: () => void;
  onError?: (error: Error) => void;
  loginHref?: string;
  /** Heading text. Pass `null`/`''` to render no heading and use your own page title. */
  heading?: string | null;
  /** Step description. Pass `null`/`''` to render nothing and use your own subtitle (TBP-631). */
  description?: string | null;
  /** Per-key copy overrides for this component only (TBP-630). */
  messages?: MessageOverrides;
}

function formatExpiry(t: Translator, seconds: number): string {
  if (seconds >= 60) {
    const count = Math.floor(seconds / 60);
    return t(count === 1 ? 'magicLink.expiryMinute' : 'magicLink.expiryMinutes', { count });
  }
  return t('magicLink.expirySeconds', { count: seconds });
}

export function MagicLink({
  onSent,
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
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [expiresIn, setExpiresIn] = useState(0);

  // `undefined` means "not passed" and falls through to the catalogue; `null`
  // is an explicit suppression from the host and must survive (TBP-631), which
  // is why this cannot collapse to `heading ?? t(...)`.
  const wrapperHeading = heading !== undefined ? heading : t('magicLink.heading');
  const wrapperDescription =
    description !== undefined ? description : t('magicLink.description');

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
      setError(authErrorMessage(err, t, 'magicLink.error.send'));
      onError?.(err);
    } finally {
      setLoading(false);
    }
  }

  // TBP-682: the emailed link returns to the page the request was made from,
  // so this component must redeem the token as well as send it. Without this
  // effect a link requested here lands back here and does nothing — the token
  // sits in the address bar and the user stays signed out. Mirrors LoginForm,
  // which has always redeemed on mount.
  //
  // Safe under StrictMode's dev-only double-invoke without a ref guard, for the
  // same reason LoginForm is: the token is removed from the URL synchronously,
  // before the redeem is started, so the second run finds no token and returns
  // at the guard above it.
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);
    const magicToken = params.get('bridge_magic_link_token');
    if (!magicToken) return;

    // Drop the token from the URL before redeeming, so a reload or a shared
    // link cannot replay it.
    params.delete('bridge_magic_link_token');
    const newSearch = params.toString();
    const newUrl = window.location.pathname + (newSearch ? `?${newSearch}` : '');
    window.history.replaceState({}, '', newUrl);

    setLoading(true);
    setError(null);
    (getBridgeAuth() as any)
      .authenticateWithMagicLinkToken(magicToken)
      .catch((err: any) => {
        setError(authErrorMessage(err, t, 'magicLink.error.auth'));
        onError?.(err);
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AuthFormWrapper
      heading={sent ? null : wrapperHeading}
      description={sent ? null : wrapperDescription}
      className={className}
      style={style}
      {...rest}
    >
      {error && <Alert variant="error">{error}</Alert>}

      {sent ? (
        <>
          <Alert variant="success">
            {t('magicLink.sent', { expiry: formatExpiry(t, expiresIn) })}
          </Alert>
          {loginHref && (
            <div className="bridge-form-footer">
              <a href={loginHref}>{t('action.backToLogin')}</a>
            </div>
          )}
        </>
      ) : (
        <>
          <form onSubmit={handleSend}>
            <div className="bridge-form-group">
              <label htmlFor="magic-email">{t('field.email')}</label>
              <input
                id="magic-email"
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
              {loading ? <Spinner size={16} /> : t('magicLink.submit')}
            </button>
          </form>
          {loginHref && (
            <div className="bridge-form-footer">
              <a href={loginHref}>{t('action.backToLogin')}</a>
            </div>
          )}
        </>
      )}
    </AuthFormWrapper>
  );
}

export default MagicLink;
