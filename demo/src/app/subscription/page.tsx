'use client';

import { PlanSelector, ProtectedRoute } from '@nebulr-group/bridge-nextjs/client';
import { useEffect, useState } from 'react';

function SubscriptionContent() {
  // window.location.origin is client-only; defer until mount to avoid SSR mismatch
  const [origin, setOrigin] = useState('');
  useEffect(() => setOrigin(window.location.origin), []);

  return (
    <div style={{ padding: '2rem' }}>
      <h1>Subscription</h1>
      <p>Pick a plan. Free plans select immediately; paid plans go to Stripe Checkout.</p>
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
