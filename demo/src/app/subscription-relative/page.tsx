'use client';

// Test harness route for the startCheckout URL normalization regression.
// PlanSelector is intentionally given relative paths so the e2e test can assert
// that auth-core resolves them to absolute URLs before hitting the
// /account/subscription/checkout endpoint.
// Regression: stripe.service.ts rejected relative success_url/cancel_url with
// 400 "Not a valid URL". Fix lives in auth-core bridge-auth.ts. (2026-04-15)

import { PlanSelector, loadSubscription } from '@nebulr-group/bridge-nextjs/client';
import { useEffect } from 'react';

export default function SubscriptionRelativePage() {
  useEffect(() => {
    void loadSubscription();
  }, []);

  return (
    <div style={{ padding: '2rem', maxWidth: '960px', margin: '0 auto' }}>
      <h1>Subscription Plans (relative URL harness)</h1>
      <PlanSelector successUrl="/plan" cancelUrl="/plan" />
    </div>
  );
}
