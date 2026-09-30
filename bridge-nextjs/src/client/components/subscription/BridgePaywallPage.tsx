'use client';

/**
 * TBP-742 (port of bridge-svelte TBP-702) — a paywall page at an address of the
 * app's choosing, e.g. onboarding at /welcome:
 *
 *   // app/welcome/page.tsx
 *   import { BridgePaywallPage } from '@nebulr-group/bridge-nextjs/client';
 *   export default function Welcome() {
 *     return <BridgePaywallPage heading="Pick a plan to get started" />;
 *   }
 *
 *   // app/layout.tsx
 *   <BridgeProvider config={{ billing: { paywallRoute: '/welcome' } }}>
 *
 * `<BridgeBillingRoutes>` already serves a paywall at /subscription/plan; this
 * is only for an app that wants its own. Mounted anywhere the paywall redirect
 * does not point, it says so in the dev console.
 *
 * A completed checkout lands on `<billing.manageRoute>/success`; a cancelled
 * one comes back here.
 */
import { usePathname } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import type { Plan, PriceOfferSdk } from '@nebulr-group/bridge-auth-core';
import { loadSubscription, useBridgeStore } from '../../../core/bridge-instance';
import { logger } from '../../../shared/logger';
import { billingRoutes } from '../../billing-routes';
import { PlanSelector } from './PlanSelector';

export interface BridgePaywallPageProps {
  /** The page heading. @default 'Choose a plan' */
  heading?: string;
  /** Content between the heading and the plans — a welcome line, a checklist. */
  children?: ReactNode;
  /** Where a completed checkout lands. @default `<billing.manageRoute>/success` */
  successUrl?: string;
  /** Where a cancelled checkout lands. @default this page */
  cancelUrl?: string;
  /** Called after a free-plan or direct plan change (not the Stripe redirect path). */
  onSelect?: (detail: { plan: Plan; price: PriceOfferSdk }) => void;
}

export function BridgePaywallPage({
  heading = 'Choose a plan',
  children,
  successUrl,
  cancelUrl,
  onSelect,
}: BridgePaywallPageProps) {
  const here = usePathname() ?? '';
  const hasStatus = useBridgeStore((s) => s.subscription.status !== null);

  useEffect(() => {
    if (!hasStatus) void loadSubscription();
    const routes = billingRoutes();
    if (process.env.NODE_ENV !== 'production' && here && routes.paywallRoute !== here) {
      logger.warn(
        `[bridge] <BridgePaywallPage> is on ${here}, but plan-less workspaces are sent to ` +
          `${routes.paywallRoute ?? '(nowhere — the paywall redirect is off)'}. ` +
          `Add billing: { paywallRoute: '${here}' } to <BridgeProvider config>.`,
      );
    }
    // Once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="bridge-paywall-page" data-bridge-paywall-page="">
      <h1 className="bridge-paywall-page-heading">{heading}</h1>
      {children}
      <PlanSelector successUrl={successUrl} cancelUrl={cancelUrl ?? (here || undefined)} onSelect={onSelect} />
    </div>
  );
}

export default BridgePaywallPage;
