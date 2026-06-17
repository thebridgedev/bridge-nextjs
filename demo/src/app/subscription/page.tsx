'use client';

import {
  BridgeBillingNotice,
  BridgeQuotaBanner,
  BridgeSubscriptionStatus,
  PlanSelector,
  ProtectedRoute,
} from '@nebulr-group/bridge-nextjs/client';
import { useEffect, useState } from 'react';

function SubscriptionContent() {
  // window.location.origin is client-only; defer until mount to avoid SSR mismatch
  const [origin, setOrigin] = useState('');
  useEffect(() => setOrigin(window.location.origin), []);

  // Metric to watch with the live quota banner. Matches the svelte demo's probe.
  const metric = 'num.clicks';

  return (
    <div style={{ padding: '2rem', maxWidth: '960px', margin: '0 auto' }}>
      <h1>Subscription</h1>
      <p>Pick a plan. Free plans select immediately; paid plans go to Stripe Checkout.</p>

      {/* ── Billing 2.0 canonical-model drop-ins ───────────────────────────── */}
      <section style={{ margin: '1.5rem 0' }}>
        <h2>Billing 2.0 components</h2>
        <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>
          Live, reactive drop-ins backed by <code>useBridge()</code> (auth-core
          billing surface). They render nothing when billing is healthy / under
          cap.
        </p>

        <div data-bridge-subscription-status style={{ margin: '0.75rem 0' }}>
          <BridgeSubscriptionStatus />
        </div>

        {/* Multi-state notice banner (past_due / trial / cancel / dunning / locked) */}
        <BridgeBillingNotice chassis="rail" />

        {/* Live quota counter — renders only at ≥80% of the cap */}
        <BridgeQuotaBanner metric={metric} chassis="rail" />
      </section>

      {/* ── Classic Stripe-direct plan picker ──────────────────────────────── */}
      {origin && (
        <PlanSelector
          successUrl={`${origin}/subscription/success`}
          cancelUrl={`${origin}/subscription/cancel`}
          onSelect={({ plan }) => console.log('[Subscription] selected', plan.key)}
        />
      )}
    </div>
  );
}

export default function SubscriptionPage() {
  return (
    <ProtectedRoute redirectTo="/auth/login">
      <SubscriptionContent />
    </ProtectedRoute>
  );
}
