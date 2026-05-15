'use client';

import { loadSubscription } from '@nebulr-group/bridge-nextjs/client';
import Link from 'next/link';
import { useEffect } from 'react';

export default function SubscriptionSuccessPage() {
  useEffect(() => {
    // Re-fetch so the UI reflects the new plan immediately after returning from Stripe.
    void loadSubscription();
  }, []);
  return (
    <div style={{ padding: '2rem' }}>
      <h1>Subscription active</h1>
      <p>Thanks — your subscription is now active.</p>
      <Link href="/" className="nav-link">
        Back to home
      </Link>
    </div>
  );
}
