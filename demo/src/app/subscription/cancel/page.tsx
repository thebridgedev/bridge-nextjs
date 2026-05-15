'use client';

import Link from 'next/link';

export default function SubscriptionCancelPage() {
  return (
    <div style={{ padding: '2rem' }}>
      <h1>Checkout cancelled</h1>
      <p>No charges were made.</p>
      <Link href="/subscription" className="nav-link">
        Try again
      </Link>
    </div>
  );
}
