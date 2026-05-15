'use client';

import type { FederationConnection } from '@nebulr-group/bridge-auth-core';
import type { HTMLAttributes, ReactNode } from 'react';
import { useEffect, useState } from 'react';
import {
  ensureAppConfig,
  getBridgeAuth,
  useBridgeStore,
} from '../../../core/bridge-instance';
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
  heading?: string;
  ssoConnections?: FederationConnection[];
  ssoMode?: 'redirect' | 'popup';
  footer?: ReactNode;
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
  ssoConnections = [],
  ssoMode = 'redirect',
  footer,
  className,
  style,
  ...rest
}: Props) {
  const authState = useBridgeStore((s) => s.authState);
  const appConfig = useBridgeStore((s) => s.appConfig);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

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
        setError(err.message || 'Magic link authentication failed.');
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
      setError(err.message || 'Invalid email or password.');
      onError?.(err);
      setLoading(false);
    }
  }

  if (authState === 'mfa-required') return <MfaChallenge onError={onError} />;
  if ((authState as any) === 'mfa-setup-required') return <MfaSetup onError={onError} />;
  if (authState === 'tenant-selection') return <TenantSelector onError={onError} />;

  return (
    <AuthFormWrapper heading={heading} className={className} style={style} {...rest}>
      {error && <Alert variant="error">{error}</Alert>}

      <form onSubmit={handleSubmit}>
        <div className="bridge-form-group">
          <label htmlFor="login-email">Email</label>
          <input
            id="login-email"
            type="email"
            placeholder="you@example.com"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
          />
        </div>

        <div className="bridge-form-group">
          <label htmlFor="login-password">Password</label>
          <div className="bridge-password-wrapper">
            <input
              id="login-password"
              type={showPassword ? 'text' : 'password'}
              placeholder="Enter your password"
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
              aria-label={showPassword ? 'Hide password' : 'Show password'}
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
              <Spinner size={16} /> Signing in…
            </>
          ) : (
            'Sign in'
          )}
        </button>

        {effectiveShowForgotPassword && (
          <div className="bridge-forgot-row">
            <a href={forgotPasswordHref} className="bridge-link">
              Forgot password?
            </a>
          </div>
        )}
      </form>

      {(effectiveShowPasskeys || effectiveShowMagicLink || effectiveSso.length > 0) && (
        <div className="bridge-divider">or</div>
      )}

      {effectiveShowPasskeys && (
        <div className="bridge-sso-row">
          <PasskeyLogin
            onLogin={onLogin}
            onError={onError}
            setupHref={passkeySetupHref}
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
            <span className="bridge-sso-btn-inner">Sign in with Magic Link</span>
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
            Don't have an account? <a href={signupHref ?? '/auth/signup'}>Sign up</a>
          </div>
        )
      )}
    </AuthFormWrapper>
  );
}

export default LoginForm;
