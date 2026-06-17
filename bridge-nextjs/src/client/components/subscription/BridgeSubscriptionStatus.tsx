'use client';

/**
 * Billing 2.0 / Phase A / US-2 (TBP-248) — ported from bridge-svelte's
 * `BridgeSubscriptionStatus.svelte`.
 *
 * Drop-in component that renders the workspace's current canonical plan name
 * + subscription status. Reads auth-core's billing `useBridge().subscription`
 * surface (the new billing-specific reactive surface — parallel to FF 2.0's
 * BridgeFlags). Do NOT confuse with the older `<PlanSelector />` which consumes
 * the Stripe-direct path via `subscriptionStore`.
 *
 * Reactive translation (§5.1): svelte `$state(useBridge().subscription.snapshot())`
 * + `onMount(() => subscription.subscribe(...))` → `useBridgeSnapshot(subscribe,
 * getSnapshot)`. The one-shot `mount()` fetch stays in a `useEffect`.
 *
 * No live push in v1 — fetches once on mount (the realtime wiring lands with the
 * provider's `attachToRealtimeClient`).
 */
import { useEffect } from 'react';
import { useBridge } from '@nebulr-group/bridge-auth-core';
import { getBridgeAuth } from '../../../core/bridge-instance';
import { useBridgeSnapshot } from '../../hooks/use-bridge-readable';

export interface BridgeSubscriptionStatusProps {
  /** Optional class applied to the root span. */
  className?: string;
}

export function BridgeSubscriptionStatus({
  className = '',
}: BridgeSubscriptionStatusProps) {
  const subscription = useBridge().subscription;

  const snapshot = useBridgeSnapshot(
    (onChange) => subscription.subscribe(() => onChange()),
    () => subscription.snapshot(),
  );

  useEffect(() => {
    const ctx = getBridgeAuth().getApiContext();
    if (!ctx.accessToken) {
      subscription.setError('Not authenticated');
      return;
    }
    void subscription.mount({
      apiBaseUrl: ctx.apiBaseUrl,
      accessToken: ctx.accessToken,
      appId: ctx.appId,
    });
    // subscription is the auth-core singleton — stable across renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <span className={`bridge-subscription-status ${className}`.trim()}>
      {snapshot.loading ? (
        <span className="bss-loading">Loading…</span>
      ) : snapshot.error ? (
        <span className="bss-error">Subscription unavailable</span>
      ) : snapshot.state ? (
        <>
          <span className="bss-plan">{snapshot.state.plan.name}</span>
          <span className={`bss-badge bss-badge-${snapshot.state.status}`}>
            {snapshot.state.status}
          </span>
        </>
      ) : (
        <span className="bss-empty">No subscription</span>
      )}
    </span>
  );
}

export default BridgeSubscriptionStatus;
