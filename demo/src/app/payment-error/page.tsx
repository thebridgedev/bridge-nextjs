'use client';

import Link from 'next/link';

/**
 * Payment-error landing. Mirrors bridge-svelte's `/payment-error` route — the
 * destination configured via `billing.paymentErrorRoute`, reached when a Stripe
 * checkout confirmation fails. PUBLIC (not behind ProtectedRoute / the paywall
 * redirect) so a user whose payment errored can still see a useful message.
 */
export default function PaymentErrorPage() {
  return (
    <div style={{ padding: '3rem 1.5rem', maxWidth: 540, margin: '0 auto', textAlign: 'center' }}>
      <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: '#b91c1c', margin: '0 0 0.75rem' }}>
        Payment could not be completed
      </h1>
      <p style={{ color: '#6b7280', lineHeight: 1.6, margin: '0 0 1.5rem' }}>
        Something went wrong confirming your payment. No charge was finalized. You
        can try again from the plan selector.
      </p>
      <Link href="/welcome" className="nav-link">
        Back to plan selection
      </Link>
    </div>
  );
}
