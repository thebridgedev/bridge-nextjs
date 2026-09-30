import { BridgePaywallPage } from '@nebulr-group/bridge-nextjs/client';

/**
 * The demo's onboarding paywall — `billing.paywallRoute: '/welcome'` in the
 * root layout sends a plan-less workspace here. (Without that line the
 * built-in /subscription/plan serves the same purpose.) A completed checkout
 * returns to /subscription, where the plan picker shows the active plan.
 */
export default function WelcomePage() {
  return (
    <BridgePaywallPage heading="Welcome — let's pick your plan" successUrl="/subscription">
      <p>You&apos;re one step away. Choose the plan that fits your team and unlock full access.</p>
    </BridgePaywallPage>
  );
}
