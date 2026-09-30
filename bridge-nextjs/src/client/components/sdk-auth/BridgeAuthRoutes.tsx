'use client';

/**
 * TBP-742 (port of bridge-svelte TBP-696) — every sign-in page from one file.
 *
 *   // app/auth/[...bridge]/page.tsx
 *   import { BridgeAuthRoutes } from '@nebulr-group/bridge-nextjs/client';
 *   export default function AuthPage() {
 *     return <BridgeAuthRoutes />;
 *   }
 *
 * Serves login, signup, oauth-callback, set-password/[token], forgot-password,
 * magic-link, setup-passkey/[token] and workspaces. An unknown segment calls
 * Next's `notFound()`, so the app's own not-found page answers.
 *
 * Customising, in rungs:
 *   1. `--bridge-*` CSS tokens restyle the forms.
 *   2. `frame(page, children)` replaces everything around the form on every
 *      page; `heading(page)` replaces the form heading on each page's main
 *      step. Both are functions, so the page file passing them is a Client
 *      Component (`'use client'`).
 *   3. To own one page outright, create it (`app/auth/login/page.tsx`): Next.js
 *      prefers the specific route over `[...bridge]`, and the other pages keep
 *      working. A hosted-login app that wants the session in cookies for
 *      `withBridgeAuth` takes over the callback the same way, with
 *      `app/auth/oauth-callback/route.ts` → `createBridgeCallbackRoute()`.
 *   4. Headless: build on `getBridgeAuth()`.
 *
 * Which sign-in methods show (magic link, passkeys, SSO) comes from the app's
 * auth config at runtime, so an operator toggles them without a deploy.
 */
import { notFound, useParams, usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { MessageOverrides } from '@nebulr-group/bridge-auth-core';
import { readReturnTo, withReturnTo } from '@nebulr-group/bridge-auth-core';
import { getBridgeAuth, getBridgeConfig, useBridgeStore } from '../../../core/bridge-instance';
import { logger } from '../../../shared/logger';
import { getTranslator } from '../../../i18n';
import {
  BRIDGE_AUTH_ROUTE_PARAM,
  bridgeAuthBase,
  parseBridgeAuthRoute,
  type BridgeAuthPage,
} from '../../auth-routes';
import { AuthFormWrapper } from './shared/AuthFormWrapper';
import { ForgotPassword } from './ForgotPassword';
import { LoginForm } from './LoginForm';
import { MagicLink } from './MagicLink';
import { PasskeySetup } from './PasskeySetup';
import { SignupForm } from './SignupForm';
import { Spinner } from './shared/Spinner';
import { WorkspaceSelector } from './WorkspaceSelector';

export interface BridgeAuthRoutesProps {
  /**
   * Everything around the form, on every page. Receives the page name and the
   * form. Replaces the default centred container entirely.
   */
  frame?: (page: BridgeAuthPage, children: ReactNode) => ReactNode;
  /**
   * The form heading, per page. Shown on each page's main step only — the
   * login credentials step, the signup form, the set-password form — so it
   * never stacks above a sub-step's own heading.
   */
  heading?: (page: BridgeAuthPage) => ReactNode;
  /**
   * Where a completed sign-in, passkey setup or workspace switch lands when
   * there is no `?redirectUri=` deep link to return to.
   * @default '/'
   */
  redirectTo?: string;
  /** Per-key copy overrides, passed to every form. */
  messages?: MessageOverrides;
}

function currentUrl(): URL | null {
  try {
    return new URL(window.location.href);
  } catch {
    return null;
  }
}

/** Hosted mode is "no loginRoute" — the same switch the route guard uses. */
function isHosted(): boolean {
  try {
    return !getBridgeConfig().loginRoute;
  } catch {
    return false;
  }
}

function hostedHref(p: BridgeAuthPage): string | null {
  try {
    const auth = getBridgeAuth();
    return p === 'signup' ? auth.createSignupUrl() : auth.createLoginUrl();
  } catch {
    return null;
  }
}

/**
 * The OAuth callback, in the browser: exchange `?code=` for a session and go on
 * to the deep link or `redirectTo`. Mirrors bridge-svelte's bootstrap callback.
 * Renders a spinner meanwhile.
 */
function OAuthCallback({ redirectTo, loginHref }: { redirectTo: string; loginHref: string }) {
  const router = useRouter();
  const started = useRef(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const url = currentUrl();
    const code = url?.searchParams.get('code');
    if (!url || !code) {
      router.replace(loginHref);
      return;
    }
    // Read before the exchange: auth-core strips the query from the address bar.
    const next = readReturnTo(url) ?? redirectTo;
    void (async () => {
      try {
        await getBridgeAuth().handleCallback(code);
        router.replace(next);
      } catch (err) {
        logger.error('[BridgeAuthRoutes] OAuth callback failed:', err);
        setFailed(true);
      }
    })();
  }, [router, redirectTo, loginHref]);

  if (failed) {
    return (
      <AuthFormWrapper heading={null}>
        <p className="bridge-step-desc">Sign-in could not be completed.</p>
        <a className="bridge-btn bridge-btn-primary" href={loginHref}>
          Try again
        </a>
      </AuthFormWrapper>
    );
  }
  return <Spinner />;
}

export function BridgeAuthRoutes({ frame, heading, redirectTo = '/', messages }: BridgeAuthRoutesProps) {
  const params = useParams();
  const pathname = usePathname() ?? '';
  const router = useRouter();
  const authenticated = useBridgeStore((s) => !!s.tokens?.accessToken);
  const t = getTranslator(messages);

  const rest = (params as Record<string, string | string[] | undefined> | null)?.[BRIDGE_AUTH_ROUTE_PARAM];
  const route = parseBridgeAuthRoute(rest ?? null);
  const base = bridgeAuthBase(pathname, rest ?? null);
  const loginHref = `${base}/login`;
  const signupHref = `${base}/signup`;
  const page = route?.page;
  const hosted = isHosted();

  const afterSignIn = () => {
    const url = currentUrl();
    router.push((url && readReturnTo(url)) ?? redirectTo);
  };

  // A magic link returns to the page it was requested from. MagicLink redeems
  // it but — unlike LoginForm — has no `onLogin`, so the sign-in it completes
  // is picked up here. Only a transition counts: a user who was already signed
  // in when the page opened is not bounced away.
  const wasAuthenticated = useRef(authenticated);
  useEffect(() => {
    if (authenticated && !wasAuthenticated.current && page === 'magic-link') afterSignIn();
    wasAuthenticated.current = authenticated;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, page]);

  // The workspace list needs a session. `/auth/*` is public, so a signed-out
  // visitor can land here; send them to sign in and back.
  useEffect(() => {
    if (page === 'workspaces' && !hosted && !authenticated) {
      const url = currentUrl();
      router.replace(withReturnTo(loginHref, url ? `${url.pathname}${url.search}` : pathname));
    }
  }, [page, hosted, authenticated, loginHref, pathname, router]);

  if (!route) notFound();
  const current = route.page;
  const headingSlot = heading ? heading(current) : undefined;

  let body: ReactNode = null;
  if (current === 'oauth-callback') {
    body = <OAuthCallback redirectTo={redirectTo} loginHref={loginHref} />;
  } else if (hosted && !(current === 'workspaces' && authenticated)) {
    // Hosted mode: every sign-in page points at the hosted login instead. A
    // signed-in user switching workspace is not signing in, so that stays.
    const href = hostedHref(current);
    body = (
      <AuthFormWrapper
        heading={t(current === 'signup' ? 'signup.heading' : 'login.heading')}
        headingSlot={headingSlot}
        data-bridge-auth-hosted=""
      >
        <p className="bridge-step-desc">Sign-in for this app happens on its hosted login page, not here.</p>
        {href ? (
          <a className="bridge-btn bridge-btn-primary" href={href}>
            {t(current === 'signup' ? 'signup.submit' : 'login.submit')}
          </a>
        ) : null}
      </AuthFormWrapper>
    );
  } else if (current === 'login') {
    body = (
      <LoginForm
        headingSlot={headingSlot}
        signupHref={signupHref}
        forgotPasswordHref={`${base}/forgot-password`}
        magicLinkHref={`${base}/magic-link`}
        onLogin={afterSignIn}
        messages={messages}
      />
    );
  } else if (current === 'signup') {
    body = <SignupForm showLoginLink loginHref={loginHref} headingSlot={headingSlot} messages={messages} />;
  } else if (current === 'set-password') {
    body = <ForgotPassword token={route.token} loginHref={loginHref} headingSlot={headingSlot} messages={messages} />;
  } else if (current === 'forgot-password') {
    body = <ForgotPassword loginHref={loginHref} headingSlot={headingSlot} messages={messages} />;
  } else if (current === 'magic-link') {
    body = <MagicLink loginHref={loginHref} headingSlot={headingSlot} messages={messages} />;
  } else if (current === 'setup-passkey' && route.token) {
    body = (
      <PasskeySetup
        key={route.token}
        token={route.token}
        loginHref={loginHref}
        headingSlot={headingSlot}
        messages={messages}
      />
    );
    // No onComplete: setting up a passkey does not sign anyone in, so the page
    // stays on its success view with the "Sign in now" link.
  } else if (current === 'workspaces' && authenticated) {
    body = (
      <AuthFormWrapper heading={t('tenant.chooseHeading')} headingSlot={headingSlot}>
        <WorkspaceSelector onSwitch={afterSignIn} messages={messages} />
      </AuthFormWrapper>
    );
  }

  return (
    <div data-bridge-auth-route={current} style={{ display: 'contents' }}>
      {frame ? frame(current, body) : <div className="bridge-auth-page">{body}</div>}
    </div>
  );
}

export default BridgeAuthRoutes;
