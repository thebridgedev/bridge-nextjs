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
import { useEffect, useState } from 'react';
import { useBridge } from '@nebulr-group/bridge-auth-core';
import { ensureBillingState, refreshBillingState } from '../../../core/billing-store';
import { useBridgeSnapshot } from '../../hooks/use-bridge-readable';

export interface BridgeSubscriptionStatusProps {
  /** Optional class applied to the root span. */
  className?: string;
  /** TBP-948 (bridge-svelte TBP-762) — wait for a read made after mount before showing a plan. */
  fresh?: boolean;
}

export function BridgeSubscriptionStatus({
  className = '',
  fresh = false,
}: BridgeSubscriptionStatusProps) {
  const subscription = useBridge().subscription;

  const snapshot = useBridgeSnapshot(
    (onChange) => subscription.subscribe(() => onChange()),
    () => subscription.snapshot(),
  );

  // "Loading…" until this badge's own read has answered when it has nothing to
  // show yet (never a "No subscription" flash), or always with `fresh`.
  const [awaiting, setAwaiting] = useState(() => fresh || subscription.snapshot().state === null);

  // TBP-948 (port of bridge-svelte TBP-762) — read what has not been read, or
  // was read more than 30 s ago; a renewed sign-in, a live billing event and
  // the tab regaining focus re-read it from there (core/billing-store.ts).
  // Every read renews an out-of-date sign-in and retries once.
  useEffect(() => {
    let live = true;
    const read = fresh ? refreshBillingState() : ensureBillingState();
    void read.finally(() => {
      if (live) setAwaiting(false);
    });
    return () => {
      live = false;
    };
    // Once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <span className={`bridge-subscription-status ${className}`.trim()}>
      {snapshot.loading || (awaiting && !snapshot.error) ? (
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
