'use client';

import { PlanSelector, loadSubscription } from '@nebulr-group/bridge-nextjs/client';
import { useEffect, useState } from 'react';

/**
 * First-time-user paywall page. Mirrors bridge-svelte's `/welcome` route.
 *
 * PUBLIC route (excluded from the paywall redirect via `billing.paywallRoute`
 * pointing here) so a plan-less authenticated user can actually land and pick a
 * plan without being bounced in a redirect loop.
 *
 * Stripe Checkout returns to `/subscription` (which also renders PlanSelector),
 * where auth-core's getSubscriptionStatus() self-syncs the completed session and
 * the selector flips to data-state="active".
 */
export default function WelcomePage() {
  // window.location.origin is client-only; defer until mount to avoid SSR mismatch.
  const [origin, setOrigin] = useState('');
  useEffect(() => {
    setOrigin(window.location.origin);
    void loadSubscription();
  }, []);

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#f8fafc',
        padding: '3rem 1.5rem',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
      }}
    >
      <div style={{ textAlign: 'center', maxWidth: 540, marginBottom: '2.5rem' }}>
        <div
          style={{
            display: 'inline-block',
            padding: '0.25rem 0.85rem',
            borderRadius: 9999,
            background: '#ede9fe',
            color: '#5b21b6',
            fontSize: '0.75rem',
            fontWeight: 700,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            marginBottom: '1rem',
          }}
        >
          Getting started
        </div>
        <h1 style={{ fontSize: '2rem', fontWeight: 700, color: '#111827', margin: '0 0 0.75rem' }}>
          Welcome — let&apos;s pick your plan
        </h1>
        <p style={{ color: '#6b7280', fontSize: '1rem', margin: 0, lineHeight: 1.6 }}>
          You&apos;re one step away. Choose the plan that fits your team and unlock full access.
        </p>
      </div>

      {origin && (
        <PlanSelector
          successUrl={`${origin}/subscription`}
          cancelUrl={`${origin}/welcome`}
        />
      )}
    </div>
  );
}
