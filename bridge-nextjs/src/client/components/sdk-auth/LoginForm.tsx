'use client';

import type { FederationConnection, MessageOverrides } from '@nebulr-group/bridge-auth-core';
import type { HTMLAttributes, ReactNode } from 'react';
import { useEffect, useState } from 'react';
import {
  ensureAppConfig,
  getBridgeAuth,
  useBridgeStore,
} from '../../../core/bridge-instance';
import { getTranslator } from '../../../i18n';
import { AuthFormWrapper } from './shared/AuthFormWrapper';
import { Alert } from './shared/Alert';
import { Spinner } from './shared/Spinner';
import { MfaChallenge } from './MfaChallenge';
import { MfaSetup } from './MfaSetup';
import { TenantSelector } from './TenantSelector';
import { SsoButton } from './SsoButton';
import { SsoProviderIcon } from './SsoProviderIcon';
import { PasskeyLogin } from './PasskeyLogin';

interface Props extends Omit<HTMLAttributes<HTMLDivElement>, 'onError'> {
  showSignupLink?: boolean;
  signupHref?: string;
  showForgotPassword?: boolean;
  forgotPasswordHref?: string;
  showMagicLink?: boolean;
  magicLinkHref?: string;
  showPasskeys?: boolean;
  passkeySetupHref?: string;
  onLogin?: () => void;
  onError?: (error: Error) => void;
  onSsoClick?: (connectionType: string) => void;
  /** Heading text. Pass `null`/`''` to render no heading and use your own page title. */
  heading?: string | null;
  headingSlot?: ReactNode;
  ssoConnections?: FederationConnection[];
  ssoMode?: 'redirect' | 'popup';
  footer?: ReactNode;
  /** Per-key copy overrides for this component only (TBP-630). Fanned out to
   *  the MFA / passkey / forgot-password sub-views this form renders, so an app
   *  overrides a phrase once rather than once per step. */
  messages?: MessageOverrides;
}

function buildSsoConnections(appConfig: any): FederationConnection[] {
  if (!appConfig) return [];
  const out: FederationConnection[] = [];
  if (appConfig.googleSsoEnabled) out.push({ id: 'google', type: 'google', name: 'Google' });
  if (appConfig.azureAdSsoEnabled) out.push({ id: 'azure', type: 'ms-azure-ad', name: 'Microsoft' });
  if (appConfig.linkedinSsoEnabled) out.push({ id: 'linkedin', type: 'linkedin', name: 'LinkedIn' });
  if (appConfig.githubSsoEnabled) out.push({ id: 'github', type: 'github', name: 'GitHub' });
  if (appConfig.facebookSsoEnabled) out.push({ id: 'facebook', type: 'facebook', name: 'Facebook' });
  if (appConfig.appleSsoEnabled) out.push({ id: 'apple', type: 'apple', name: 'Apple' });
  return out;
}

export function LoginForm({
  showSignupLink,
  signupHref,
  showForgotPassword,
  forgotPasswordHref = '/auth/forgot-password',
  showMagicLink,
  magicLinkHref = '/auth/magic-link',
  showPasskeys,
  passkeySetupHref = '/auth/setup-passkey',
  onLogin,
  onError,
  onSsoClick,
  heading = '',
  headingSlot,
  ssoConnections = [],
  ssoMode = 'redirect',
  footer,
  messages,
  className,
  style,
  ...rest
}: Props) {
  const t = getTranslator(messages);
  const authState = useBridgeStore((s) => s.authState);
  const appConfig = useBridgeStore((s) => s.appConfig);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  // Inline step machine — mirrors bridge-svelte. Forgot-password renders in
  // place of the credentials form (not a separate route) so the spec's
  // "click forgot → no email/password inputs → click back-to-login → email
  // input visible again" round-trip works without a navigation.
  const [step, setStep] = useState<'credentials' | 'forgot-password'>('credentials');
  const [fpEmailSent, setFpEmailSent] = useState(false);
  const [fpLoading, setFpLoading] = useState(false);

  function goBackToCredentials() {
    setStep('credentials');
    setFpEmailSent(false);
    setError(null);
  }

  async function handleForgotSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (fpLoading) return;
    setError(null);
    setFpLoading(true);
    try {
      await getBridgeAuth().sendResetPasswordLink(email);
      setFpEmailSent(true);
    } catch (err: any) {
      setError(err.message || t('forgot.error.send'));
      onError?.(err);
    } finally {
      setFpLoading(false);
    }
  }

  const effectiveSso =
    ssoConnections.length > 0 ? ssoConnections : buildSsoConnections(appConfig);
  const effectiveShowMagicLink = showMagicLink ?? appConfig?.magicLinkEnabled ?? false;
  const effectiveShowPasskeys = showPasskeys ?? appConfig?.passkeysEnabled ?? false;
  const effectiveShowForgotPassword = showForgotPassword ?? true;
  const effectiveShowSignupLink = showSignupLink ?? appConfig?.signupEnabled ?? true;

  useEffect(() => {
    void ensureAppConfig();

    // Magic link token detection — same flow as svelte
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const magicToken = params.get('bridge_magic_link_token');
    if (!magicToken) return;

    params.delete('bridge_magic_link_token');
    const newSearch = params.toString();
    const newUrl = window.location.pathname + (newSearch ? `?${newSearch}` : '');
    window.history.replaceState({}, '', newUrl);

    setLoading(true);
    (getBridgeAuth() as any)
      .authenticateWithMagicLinkToken(magicToken)
      .catch((err: any) => {
        setError(err.message || t('magicLink.error.auth'));
        onError?.(err);
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (authState === 'authenticated') onLogin?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authState]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setError(null);
    setLoading(true);
    try {
      await getBridgeAuth().authenticate(email, password);
    } catch (err: any) {
      setError(err.message || t('login.error.invalidCredentials'));
      onError?.(err);
      setLoading(false);
    }
  }

  if (authState === 'mfa-required') return <MfaChallenge onError={onError} messages={messages} />;
  if ((authState as any) === 'mfa-setup-required') return <MfaSetup onError={onError} messages={messages} />;
  if (authState === 'tenant-selection')
    return <TenantSelector onError={onError} messages={messages} />;

  // Settling: the session is real and the host app has not navigated yet.
  //
  // This test is `!== 'unauthenticated'` rather than an explicit list of
  // `authenticated | credentials-validated` on purpose. Those two used to fall
  // through to the credentials form below, so somebody who had just typed their
  // password correctly was shown the password form again — which reads as a
  // refusal, and the reasonable response is to type it again (TBP-635). The
  // window opens when the token exchange resolves and closes only when the
  // consumer's router lands, because LoginForm fires `onLogin` and deliberately
  // does not navigate.
  //
  // Listing the two states would fix the two we know about and leave the next
  // `AuthState` member falling into the same hole. Inverting the test means the
  // credentials form renders ONLY for `unauthenticated`, and anything else lands
  // on a spinner — wrong-but-harmless instead of wrong-and-alarming.
  //
  // `login.submitting` is reused rather than given its own key: it already says
  // "Signing in…" in all twelve locales.
  if (authState !== 'unauthenticated') {
    return (
      <AuthFormWrapper heading={null} className={className} style={style} {...rest}>
        <div className="bridge-auth-settling" data-bridge-auth-settling>
          <Spinner size={24} />
          <span>{t('login.submitting')}</span>
        </div>
      </AuthFormWrapper>
    );
  }

  if (step === 'forgot-password') {
    return (
      <AuthFormWrapper
        heading={fpEmailSent ? null : t('forgot.headingRequest')}
        className={className}
        style={style}
        {...rest}
      >
        {error && <Alert variant="error">{error}</Alert>}

        {fpEmailSent ? (
          <>
            <Alert variant="success">{t('forgot.emailSent')}</Alert>
            <div className="bridge-form-footer">
              <button type="button" className="bridge-link" onClick={goBackToCredentials}>
                {t('action.backToLogin')}
              </button>
            </div>
          </>
        ) : (
          <>
            <form onSubmit={handleForgotSubmit}>
              <div className="bridge-form-group">
                <label htmlFor="forgot-email">{t('field.email')}</label>
                <input
                  id="forgot-email"
                  type="email"
                  placeholder={t('placeholder.email')}
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={fpLoading}
                />
              </div>
              <button
                type="submit"
                className="bridge-btn bridge-btn-primary"
                disabled={fpLoading || !email.trim()}
              >
                {fpLoading ? <Spinner size={16} /> : t('forgot.submit')}
              </button>
            </form>
            <div className="bridge-form-footer">
              <button type="button" className="bridge-link" onClick={goBackToCredentials}>
                {t('action.backToLogin')}
              </button>
            </div>
          </>
        )}
      </AuthFormWrapper>
    );
  }

  return (
    <AuthFormWrapper
      heading={heading}
      headingSlot={headingSlot}
      className={className}
      style={style}
      {...rest}
    >
      {error && <Alert variant="error">{error}</Alert>}

      <form onSubmit={handleSubmit}>
        <div className="bridge-form-group">
          <label htmlFor="login-email">{t('field.email')}</label>
          <input
            id="login-email"
            type="email"
            placeholder={t('placeholder.email')}
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
          />
        </div>

        <div className="bridge-form-group">
          <label htmlFor="login-password">{t('field.password')}</label>
          <div className="bridge-password-wrapper">
            <input
              id="login-password"
              type={showPassword ? 'text' : 'password'}
              placeholder={t('placeholder.password')}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
            />
            <button
              type="button"
              className="bridge-password-toggle"
              onClick={() => setShowPassword((v) => !v)}
              tabIndex={-1}
              aria-label={showPassword ? t('action.hidePassword') : t('action.showPassword')}
            >
              {showPassword ? '🙈' : '👁'}
            </button>
          </div>
        </div>

        <button
          type="submit"
          className="bridge-btn bridge-btn-primary"
          disabled={loading || !email.trim() || !password}
        >
          {loading ? (
            <>
              <Spinner size={16} /> {t('login.submitting')}
            </>
          ) : (
            t('login.submit')
          )}
        </button>

        {effectiveShowForgotPassword && (
          <div className="bridge-forgot-row">
            <button
              type="button"
              className="bridge-link"
              onClick={() => {
                setStep('forgot-password');
                setError(null);
              }}
            >
              {t('login.forgotPassword')}
            </button>
          </div>
        )}
      </form>

      {(effectiveShowPasskeys || effectiveShowMagicLink || effectiveSso.length > 0) && (
        <div className="bridge-divider">{t('divider.or')}</div>
      )}

      {effectiveShowPasskeys && (
        <div className="bridge-sso-row">
          <PasskeyLogin
            onLogin={onLogin}
            onError={onError}
            setupHref={passkeySetupHref}
            messages={messages}
            className="bridge-btn bridge-btn-secondary bridge-sso-btn"
          />
        </div>
      )}

      {effectiveShowMagicLink && (
        <div className="bridge-sso-row">
          <a
            href={magicLinkHref}
            className="bridge-btn bridge-btn-secondary bridge-sso-btn"
            data-bridge-magic-link
          >
            <span className="bridge-sso-btn-inner">{t('login.magicLink')}</span>
          </a>
        </div>
      )}

      {effectiveSso.map((conn) => (
        <div key={conn.id} className="bridge-sso-row">
          {onSsoClick ? (
            <button
              type="button"
              className="bridge-btn bridge-btn-secondary bridge-sso-btn"
              onClick={() => onSsoClick(conn.type)}
            >
              <SsoProviderIcon type={conn.type} />
              <span>{conn.name}</span>
            </button>
          ) : (
            <SsoButton
              connection={conn}
              mode={ssoMode}
              onSuccess={onLogin}
              onError={onError}
              className="bridge-btn bridge-btn-secondary bridge-sso-btn"
              icon={<SsoProviderIcon type={conn.type} />}
            />
          )}
        </div>
      ))}

      {footer ?? (
        effectiveShowSignupLink && (
          <div className="bridge-form-footer">
            {t('login.signupPrompt')}{' '}
            <a href={signupHref ?? '/auth/signup'}>{t('login.signupLink')}</a>
          </div>
        )
      )}
    </AuthFormWrapper>
  );
}

export default LoginForm;
