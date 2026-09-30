'use client';

/**
 * TBP-742 (port of bridge-svelte TBP-702) — the subscription page, the paywall
 * and the checkout return pages, from one file.
 *
 *   // app/subscription/[[...bridge]]/page.tsx
 *   import { BridgeBillingRoutes } from '@nebulr-group/bridge-nextjs/client';
 *   export default function SubscriptionPage() {
 *     return <BridgeBillingRoutes />;
 *   }
 *
 * The double brackets make the catch-all optional, so the bare /subscription
 * matches too (Next.js's `[...x]` needs at least one segment; SvelteKit's does
 * not). Serves, relative to wherever the catch-all lives:
 *   /subscription          the current plan, the plan picker and "Manage billing"
 *   /subscription/plan     the paywall: where a plan-less workspace is sent
 *   /subscription/success  where a completed checkout lands
 *   /subscription/error    where a failed checkout confirmation lands
 * An unknown segment calls `notFound()`.
 *
 * Those are the defaults of `billing.manageRoute`, `billing.paywallRoute` and
 * `billing.paymentErrorRoute`, so nothing Bridge redirects to is a 404.
 *
 * Customising, in rungs: `--bridge-*` tokens; `frame(page, children)` and
 * `heading(page)` (functions — the page file is then a Client Component); take
 * over one page by creating it (`app/subscription/plan/page.tsx`); headless:
 * `PlanSelector`, `BridgeSubscriptionStatus`, `BillingPortalButton`.
 */
import { withReturnTo } from '@nebulr-group/bridge-auth-core';
import { notFound, useParams, usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { getBridgeConfig, loadSubscription, useBridgeStore } from '../../../core/bridge-instance';
import { BRIDGE_AUTH_ROUTE_PARAM, bridgeAuthBase } from '../../auth-routes';
import { parseBridgeBillingRoute, type BridgeBillingPage } from '../../billing-routes';
import { BillingPortalButton } from './BillingPortalButton';
import { BridgeSubscriptionStatus } from './BridgeSubscriptionStatus';
import { PlanSelector } from './PlanSelector';

export interface BridgeBillingRoutesProps {
  /** Everything around the content, on every page. Replaces the default centred column. */
  frame?: (page: BridgeBillingPage, children: ReactNode) => ReactNode;
  /** Each page's heading. Replaces the default one. */
  heading?: (page: BridgeBillingPage) => ReactNode;
  /** Where "Continue" on the success page goes. @default '/' */
  redirectTo?: string;
}

const DEFAULT_HEADINGS: Record<BridgeBillingPage, string> = {
  manage: 'Subscription',
  plan: 'Choose a plan',
  success: "You're all set",
  error: "We couldn't confirm your payment",
};

export function BridgeBillingRoutes({ frame, heading, redirectTo = '/' }: BridgeBillingRoutesProps) {
  const params = useParams();
  const pathname = usePathname() ?? '';
  const rest = (params as Record<string, string | string[] | undefined> | null)?.[BRIDGE_AUTH_ROUTE_PARAM];
  const route = parseBridgeBillingRoute(rest);
  const base = bridgeAuthBase(pathname, rest) || '/';
  const at = (sub: string) => (base === '/' ? `/${sub}` : `${base}/${sub}`);
  const page = route?.page;
  const hasStatus = useBridgeStore((s) => s.subscription.status !== null);
  const authenticated = useBridgeStore((s) => !!s.tokens?.accessToken);
  const router = useRouter();
  const loginRoute = (() => {
    try {
      return getBridgeConfig().loginRoute ?? null;
    } catch {
      return null;
    }
  })();

  // TBP-742 — every page here needs a session. A signed-out visitor saw
  // "Subscription unavailable / Not authenticated" (found on stage with
  // 0.8.0-beta.1); send them to sign in and back, as bridge-svelte's route
  // guard does. Hosted-mode apps guard these pages in `withBridgeAuth`.
  // Decided after mount: the server render has no session, and deciding there
  // would make every signed-in page fail hydration.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const signedOut = !authenticated && !!loginRoute;
  const mustSignIn = mounted && signedOut;
  useEffect(() => {
    if (!mustSignIn || !loginRoute) return;
    let back = pathname;
    try {
      back = `${window.location.pathname}${window.location.search}`;
    } catch {
      /* keep the pathname */
    }
    router.replace(withReturnTo(loginRoute, back));
  }, [mustSignIn, loginRoute, pathname, router]);

  // The success page always re-reads: the checkout just changed the plan, and
  // whatever the store holds predates that. Other pages read once.
  useEffect(() => {
    if (!page || signedOut) return;
    if (page === 'success' || !hasStatus) void loadSubscription();
    // Keyed on the page: moving between these pages reuses this component.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, signedOut]);

  if (!route) notFound();
  if (mustSignIn) return null;
  const current = route.page;

  let body: ReactNode = null;
  if (current === 'manage') {
    body = (
      <>
        <div className="bridge-billing-current">
          <span className="bridge-billing-label">Current plan</span>
          <BridgeSubscriptionStatus />
          <BillingPortalButton />
        </div>
        <PlanSelector successUrl={at('success')} cancelUrl={base} />
      </>
    );
  } else if (current === 'plan') {
    body = (
      <>
        <p className="bridge-billing-text">Pick a plan to start using the app.</p>
        <PlanSelector successUrl={at('success')} cancelUrl={at('plan')} />
      </>
    );
  } else if (current === 'success') {
    body = (
      <>
        <p className="bridge-billing-text">Your plan is active.</p>
        <div className="bridge-billing-current">
          <span className="bridge-billing-label">Current plan</span>
          <BridgeSubscriptionStatus />
        </div>
        <a className="bridge-btn-primary bridge-billing-action" href={redirectTo}>
          Continue
        </a>
      </>
    );
  } else {
    body = (
      <>
        <p className="bridge-billing-text">
          The payment may still have gone through. Check your subscription in a moment; if it has not
          changed, try again.
        </p>
        <a className="bridge-btn-primary bridge-billing-action" href={base}>
          Back to subscription
        </a>
      </>
    );
  }

  const content = (
    <>
      {heading ? heading(current) : <h1 className="bridge-billing-heading">{DEFAULT_HEADINGS[current]}</h1>}
      {body}
    </>
  );

  return (
    <div data-bridge-billing-route={current} style={{ display: 'contents' }}>
      {frame ? frame(current, content) : <div className="bridge-billing-page">{content}</div>}
    </div>
  );
}

export default BridgeBillingRoutes;
