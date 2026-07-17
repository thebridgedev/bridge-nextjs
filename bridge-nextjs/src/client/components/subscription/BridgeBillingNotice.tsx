'use client';

/**
 * Billing 2.0 / Phase B / US-5 → US-9 — ported from bridge-svelte's
 * `BridgeBillingNotice.svelte`.
 *
 * Unified billing-notice component. Renders the workspace's current billing
 * notice based on auth-core's `useBridge().subscription`. Multi-state from the
 * start: past_due, cancellation, trial, dunning, locked. New states slot in via
 * the notice-state → content map without restructuring.
 *
 * Audience: reads the existing auth context to render admin (CTA) vs member
 * (no CTA) variants. Per the locked decision, role lives where it lives today —
 * NOT on `useBridge().subscription`.
 *
 * Not dismissible — stays until status flips back to active.
 *
 * Reactive translation (§5.1): svelte `$state(snapshot())` + `onMount(subscribe)`
 * → `useBridgeSnapshot`; `$derived(...)` → `useMemo`; `{#if}/{:else}` → JSX;
 * `onclick` → `onClick`.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  deriveNoticeState,
  deriveSeverity,
  useBridge,
  type BillingNoticeState,
  type BillingSubscriptionState,
} from '@nebulr-group/bridge-auth-core';
import { getBridgeAuth } from '../../../core/bridge-instance';
import { useBridgeSnapshot } from '../../hooks/use-bridge-readable';

type Chassis = 'bar' | 'rail' | 'card';

export interface BridgeBillingNoticeProps {
  /** Visual chassis variant. */
  chassis?: Chassis;
  /**
   * Gate behavior. `soft` (default) always renders the inline banner. `hard`
   * renders a full-screen blocking lockscreen when the workspace is locked
   * (gate engaged); non-locked states still render as the inline banner.
   */
  mode?: 'soft' | 'hard';
  /** Optional class applied to the root element. */
  className?: string;
  /** Override the default CTA click handler (links to billing surface). */
  onActionClick?: (state: BillingNoticeState) => void;
}

export function BridgeBillingNotice({
  chassis = 'rail',
  mode = 'soft',
  className = '',
  onActionClick,
}: BridgeBillingNoticeProps) {
  const subscription = useBridge().subscription;

  const snapshot = useBridgeSnapshot(
    (onChange) => subscription.subscribe(() => onChange()),
    () => subscription.snapshot(),
  );

  // Admin/member variant. v1 policy: workspace owner only, via
  // canManageBilling() (immutable OWNER role key). Defaults to non-admin if
  // unavailable.
  const [isBillingAdmin, setIsBillingAdmin] = useState(false);

  useEffect(() => {
    const ctx = getBridgeAuth().getApiContext();
    if (ctx.accessToken) {
      setIsBillingAdmin(getBridgeAuth().canManageBilling());
    }
    if (!ctx.accessToken) {
      subscription.setError('Not authenticated');
      return;
    }
    if (!subscription.snapshot().state) {
      void subscription.mount({
        apiBaseUrl: ctx.apiBaseUrl,
        accessToken: ctx.accessToken,
        appId: ctx.appId,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const noticeState = useMemo<BillingNoticeState>(
    () => deriveNoticeState(snapshot.state),
    [snapshot.state],
  );
  const severity = useMemo(() => deriveSeverity(noticeState), [noticeState]);
  const visible = snapshot.state !== null && noticeState !== 'active';
  const asLockscreen = mode === 'hard' && severity === 'locked';

  const copy = useMemo(
    () => getCopy(noticeState, isBillingAdmin, snapshot.state),
    [noticeState, isBillingAdmin, snapshot.state],
  );

  function handleAction(): void {
    if (onActionClick) {
      onActionClick(noticeState);
      return;
    }
    // Default: open the existing billing surface. Apps can override via
    // `onActionClick`.
    if (typeof window !== 'undefined') {
      window.location.href = '/billing';
    }
  }

  if (!visible) return null;

  if (asLockscreen) {
    return (
      <div
        className={`bridge-billing-lockscreen ${className}`.trim()}
        role="alertdialog"
        aria-modal="true"
        aria-live="assertive"
      >
        <div className="bbl-panel">
          <strong className="bbl-title">{copy.title}</strong>
          <span className="bbl-body">{copy.body}</span>
          {copy.cta && isBillingAdmin && (
            <button type="button" className="bbl-cta" onClick={handleAction}>
              {copy.cta}
            </button>
          )}
        </div>
      </div>
    );
  }

  const isAssertive = severity === 'critical' || severity === 'locked';
  return (
    <div
      className={`bridge-billing-notice bbn-chassis-${chassis} bbn-severity-${severity} ${className}`.trim()}
      role={isAssertive ? 'alert' : 'status'}
      aria-live={isAssertive ? 'assertive' : 'polite'}
    >
      <div className="bbn-content">
        <strong className="bbn-title">{copy.title}</strong>
        <span className="bbn-body">{copy.body}</span>
      </div>
      {copy.cta && isBillingAdmin && (
        <button type="button" className="bbn-cta" onClick={handleAction}>
          {copy.cta}
        </button>
      )}
    </div>
  );
}

/**
 * Copy map. US-5 ships past_due copy; later stories fill in trial/cancel/dunning
 * variants. Member variant suppresses the CTA and softens the call-to-action.
 * Pure function — ported verbatim from the svelte source.
 */
function getCopy(
  state: BillingNoticeState,
  admin: boolean,
  snap: BillingSubscriptionState | null,
): { title: string; body: string; cta?: string } {
  const cardLast4 = snap?.cardLast4;
  const endsAt = snap?.endsAt;
  const daysLeft = snap?.daysLeft;
  const nextRetryAt = snap?.nextRetryAt;

  switch (state) {
    case 'past_due':
      return admin
        ? {
            title: 'Payment failed',
            body: cardLast4
              ? `We couldn't charge your card ending in ${cardLast4}. Update your payment method to keep using ${snap?.plan.name ?? 'your plan'}.`
              : `We couldn't charge your card. Update your payment method to keep using ${snap?.plan.name ?? 'your plan'}.`,
            cta: 'Update card',
          }
        : {
            title: "Your workspace's payment failed",
            body: 'Please contact your workspace owner to update the payment method.',
          };
    case 'past_due_trial':
      return admin
        ? {
            title: 'Trial ended',
            body: 'Add a payment method to keep using your workspace.',
            cta: 'Add card',
          }
        : {
            title: "Your workspace's trial has ended",
            body: 'Please contact your workspace owner to add a payment method.',
          };
    case 'trial_active':
      return admin
        ? {
            title: 'Trial active',
            body: daysLeft !== undefined ? `${daysLeft} days left in your trial.` : 'Trial in progress.',
          }
        : {
            title: 'Trial active',
            body: daysLeft !== undefined ? `${daysLeft} days left.` : 'Trial in progress.',
          };
    case 'trial_ending_soon':
      return admin
        ? {
            title: 'Trial ending soon',
            body: daysLeft !== undefined ? `${daysLeft} days left. Add a payment method to keep your access.` : 'Add a payment method to keep your access.',
            cta: 'Add card',
          }
        : {
            title: 'Trial ending soon',
            body: daysLeft !== undefined ? `${daysLeft} days left.` : 'Contact your workspace owner.',
          };
    case 'cancel_at_period_end':
      return admin
        ? {
            title: 'Subscription ending',
            body: endsAt
              ? `Your subscription ends ${new Date(endsAt).toLocaleDateString()}. You'll keep full access until then.`
              : "Your subscription is ending. You'll keep access until the period ends.",
            cta: 'Reactivate',
          }
        : {
            title: 'Subscription ending',
            body: endsAt ? `Your workspace's subscription ends ${new Date(endsAt).toLocaleDateString()}.` : "Your workspace's subscription is ending.",
          };
    case 'canceled':
      return admin
        ? { title: 'Subscription canceled', body: 'Your subscription has ended. Choose a plan to continue.', cta: 'Choose plan' }
        : { title: 'Subscription canceled', body: 'Please contact your workspace owner.' };
    case 'dunning_active':
      return admin
        ? {
            title: 'Payment retry scheduled',
            body: nextRetryAt
              ? `We'll retry your payment on ${new Date(nextRetryAt).toLocaleDateString()}. Update your card to avoid interruption.`
              : "We'll retry your payment soon. Update your card to avoid interruption.",
            cta: 'Update card',
          }
        : { title: 'Payment retry scheduled', body: 'Please contact your workspace owner to update the payment method.' };
    case 'dunning_final_retry':
      return admin
        ? {
            title: 'Final payment retry',
            body: 'This is the last automatic retry. Update your card now to avoid losing access.',
            cta: 'Update card',
          }
        : { title: 'Final payment retry', body: 'Please contact your workspace owner immediately.' };
    case 'dunning_exhausted':
      return admin
        ? { title: 'Access locked', body: 'Payment retries have exhausted. Update your card to restore access.', cta: 'Update card' }
        : { title: 'Access locked', body: 'Please contact your workspace owner.' };
    default:
      return { title: '', body: '' };
  }
}

export default BridgeBillingNotice;
