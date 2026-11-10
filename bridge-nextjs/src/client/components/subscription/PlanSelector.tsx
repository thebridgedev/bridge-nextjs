'use client';

import { HttpError, type Plan, type PriceOfferSdk } from '@nebulr-group/bridge-auth-core';
import { useRouter } from 'next/navigation';
import type { HTMLAttributes, ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ensureSubscription,
  getBridgeAuth,
  loadSubscription,
  useBridgeStore,
} from '../../../core/bridge-instance';
import { refreshBilling } from '../../../core/billing-store';
import { billingRoutes } from '../../billing-routes';
import { markCheckoutComplete } from '../../checkout-result';
import { Alert } from '../sdk-auth/shared/Alert';
import { Spinner } from '../sdk-auth/shared/Spinner';
import { formatAmount, intervalSuffix, minAmount, pickKind, pickLabel } from './plan-format';
import { pickPlan } from './plan-pick';

type UiState =
  | 'idle'
  | 'payment-failed'
  | 'setup-payments'
  | 'select-plan'
  | 'active'
  | 'trial';

type BillingInterval = PriceOfferSdk['recurrenceInterval'];

interface Props extends Omit<HTMLAttributes<HTMLDivElement>, 'onSelect'> {
  /** A heading above the plans, beside the Monthly/Yearly switch (TBP-946). */
  heading?: string;
  /**
   * Where a completed Stripe checkout, or a plan changed right here (a Free
   * pick), lands. A path is made absolute against the page's origin for Stripe.
   * @default `billing.successRoute`, else the subscription page (`billing.manageRoute`)
   */
  successUrl?: string;
  /**
   * Where a cancelled Stripe checkout lands. A path is made absolute.
   * @default the current page
   */
  cancelUrl?: string;
  /**
   * Which billing interval is selected by default when the plans offer more
   * than one. Falls back to the first one offered. @default 'year'
   */
  defaultInterval?: BillingInterval;
  /**
   * Called after a plan changed right here (a Free pick, a confirmed switch for
   * a workspace that already pays, or a plan Bridge set without Stripe). On a
   * Free pick or a plan Bridge set, passing it takes over what happens next: no
   * navigation and no banner.
   */
  onSelect?: (detail: { plan: Plan; price: PriceOfferSdk }) => void;
  /** Replaces the whole default card (S2 customization hook). `interval` is the selected one. */
  planCard?: (ctx: {
    plan: Plan;
    prices: PriceOfferSdk[];
    isCurrent: boolean;
    interval: BillingInterval;
    onPick: (price: PriceOfferSdk) => void;
  }) => ReactNode;
  /**
   * Replaces the built-in description paragraph of the default card — custom
   * copy or markup per plan without reimplementing the whole card.
   */
  planDescription?: (ctx: { plan: Plan; isCurrent: boolean }) => ReactNode;
  /** Rendered at the bottom of the default card, after the price buttons. */
  planFooter?: (ctx: { plan: Plan; isCurrent: boolean }) => ReactNode;
  /** Replaces the "plans could not be loaded" message and its retry button. */
  emptyState?: ReactNode;
  loadingState?: ReactNode;
}

const INTERVAL_LABELS: Record<BillingInterval, string> = {
  day: 'Daily',
  week: 'Weekly',
  month: 'Monthly',
  year: 'Yearly',
};

/** A path made absolute against the page's origin; an absolute URL as it is. */
export function absoluteCheckoutUrl(url: string): string {
  if (typeof window === 'undefined') return url;
  try {
    return new URL(url, window.location.origin).href;
  } catch {
    return url;
  }
}

/** TBP-755 — the features a plan includes. Structural: older APIs send none. */
function planFeatures(plan: Plan): ReadonlyArray<{ key: string; name: string }> {
  return (plan as Plan & { features?: ReadonlyArray<{ key: string; name: string }> }).features ?? [];
}

/**
 * Re-read the plan list and current plan, the billing state behind the status
 * line and the plan's features (TBP-948: one rule, `core/billing-store.ts`).
 */
async function refreshAfterPick(): Promise<void> {
  await refreshBilling();
}

export function PlanSelector({
  heading,
  successUrl,
  cancelUrl,
  defaultInterval = 'year',
  onSelect,
  planCard,
  planDescription,
  planFooter,
  emptyState,
  loadingState,
  className,
  style,
  ...rest
}: Props) {
  const subscription = useBridgeStore((s) => s.subscription);
  const { status, plans, loading, error: storeError } = subscription;
  const billing = useBridgeStore((s) => s.billing);
  const router = useRouter();

  const [picking, setPicking] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [intervalOverride, setIntervalOverride] = useState<BillingInterval | null>(null);
  const [retrying, setRetrying] = useState(false);
  // Plan-change confirmation (bridge-svelte TBP-33): switching a workspace that
  // already pays is instant (no Stripe page), so it asks first.
  const [confirmTarget, setConfirmTarget] = useState<{ plan: Plan; price: PriceOfferSdk } | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);
  const successTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(successTimer.current), []);

  const uiState: UiState = useMemo(() => {
    if (!status) return 'idle';
    if (status.paymentFailed) return 'payment-failed';
    if (status.shouldSetupPayments) return 'setup-payments';
    if (status.shouldSelectPlan) return 'select-plan';
    if (status.trial) return 'trial';
    if (status.paymentsEnabled || status.plan) return 'active';
    return 'select-plan';
  }, [status]);

  // auth-core's `SubscriptionStatus.plan` is typed as `string` in 0.1.2 but
  // the actual API and bridge-svelte's runtime use shape `{ key, name, ... }`.
  // Handle both: object form (current API) and string fallback (older deployments).
  const planField = status?.plan as unknown as
    | { key: string }
    | string
    | undefined;
  const currentPlanKey =
    typeof planField === 'string' ? planField : planField?.key ?? null;
  const currentPlan = (plans ?? []).find((p) => p.key === currentPlanKey) ?? null;
  const currentPlanName = currentPlan?.name ?? currentPlanKey ?? 'your current plan';

  function formatPrice(price: PriceOfferSdk): string {
    return price.amount === 0 ? 'Free' : `${formatAmount(price.amount, price.currency)} ${intervalSuffix(price)}`;
  }

  // Distinct intervals offered by any paid price, in a stable order. Free
  // prices fit every interval and add no tab. The switch shows only when there
  // is a real choice.
  const availableIntervals = useMemo<BillingInterval[]>(() => {
    const order: BillingInterval[] = ['day', 'week', 'month', 'year'];
    return order.filter((i) =>
      (plans ?? []).some((plan) => plan.prices.some((p) => p.amount > 0 && p.recurrenceInterval === i)),
    );
  }, [plans]);
  const showIntervalTabs = availableIntervals.length >= 2;
  const selectedInterval: BillingInterval =
    intervalOverride && availableIntervals.includes(intervalOverride)
      ? intervalOverride
      : availableIntervals.includes(defaultInterval)
      ? defaultInterval
      : availableIntervals[0] ?? defaultInterval;

  // At most one price per plan for the selected interval, since each price is
  // its own button; a free price from any interval keeps a free plan pickable.
  function pricesForInterval(plan: Plan): PriceOfferSdk[] {
    const exact = plan.prices.filter((p) => p.recurrenceInterval === selectedInterval);
    if (exact.length > 0) return exact;
    const free = plan.prices.find((p) => p.amount === 0);
    return free ? [free] : [];
  }

  // Cheapest first, by each plan's cheapest price in any interval, so cards do
  // not reshuffle when the interval changes. Plans with no price sort last.
  const sortedPlans = useMemo(() => [...(plans ?? [])].sort((a, b) => minAmount(a) - minAmount(b)), [plans]);

  // TBP-948 (bridge-svelte TBP-762) — read what has not been read, or was read
  // more than 30 s ago; the refresh rule keeps it current from there.
  useEffect(() => {
    void ensureSubscription();
  }, []);

  /** In-app paths go through the router; anything else is a full navigation. */
  function navigate(url: string): void {
    try {
      const target = new URL(url, window.location.origin);
      if (target.origin === window.location.origin) {
        router.push(`${target.pathname}${target.search}${target.hash}`);
        return;
      }
    } catch {
      /* not a URL: let the browser resolve it */
    }
    window.location.href = url;
  }

  /** TBP-762: an empty plan list is not proof the app has none; offer a retry. */
  async function retryPlans(): Promise<void> {
    setRetrying(true);
    try {
      await loadSubscription();
    } finally {
      setRetrying(false);
    }
  }

  function showSuccess(message: string): void {
    setSuccessNotice(message);
    clearTimeout(successTimer.current);
    successTimer.current = setTimeout(() => setSuccessNotice(null), 6000);
  }

  async function confirmPlanChange(): Promise<void> {
    if (!confirmTarget) return;
    const { plan, price } = confirmTarget;
    setConfirmBusy(true);
    setConfirmError(null);
    try {
      await getBridgeAuth().changePlan(plan.key, price);
      await refreshAfterPick();
      setConfirmTarget(null);
      showSuccess(`You're now on ${plan.name} (${formatPrice(price)}).`);
      onSelect?.({ plan, price });
    } catch (err) {
      // The failure shows inside the dialog, not only as a banner.
      setConfirmError(err instanceof Error ? err.message : 'Plan change failed');
    } finally {
      setConfirmBusy(false);
    }
  }

  async function handlePick(plan: Plan, price: PriceOfferSdk): Promise<void> {
    setPicking(true);
    setPickError(null);
    try {
      const outcome = await pickPlan(
        plan,
        price,
        {
          paymentsEnabled: !!status?.paymentsEnabled,
          successUrl: successUrl ?? billingRoutes().successRoute,
          cancelUrl: cancelUrl ?? window.location.href,
          onSelect,
        },
        {
          auth: getBridgeAuth(),
          refresh: refreshAfterPick,
          navigate,
          leave: (url) => {
            window.location.href = url;
          },
          absolute: absoluteCheckoutUrl,
          // TBP-946 — the landing page shows "You're on <plan> now".
          complete: (picked) => markCheckoutComplete({ kind: 'plan', planName: picked.name }),
        },
      );
      if (outcome === 'confirm') {
        setConfirmTarget({ plan, price });
        setConfirmError(null);
      }
    } catch (err) {
      // Backend plan/entitlement gating denies with 402 Payment Required
      // (TBP-472/473 route-rule guards) — route to the paywall rather than
      // surfacing a raw error, mirroring the automatic paywall redirect in
      // <BridgeProvider>. Falls back to an inline message if no paywallRoute
      // is configured for this app.
      if (err instanceof HttpError && err.status === 402) {
        const body = err.body as { error?: string; reason?: string } | undefined;
        if (billing?.paywallRoute && typeof window !== 'undefined') {
          window.location.href = billing.paywallRoute as string;
          return;
        }
        setPickError(body?.error ?? 'This plan requires an upgrade.');
      } else {
        setPickError(err instanceof Error ? err.message : 'Something went wrong');
      }
    } finally {
      setPicking(false);
    }
  }

  async function handleManageBilling(): Promise<void> {
    setPortalLoading(true);
    setPickError(null);
    try {
      const url = await getBridgeAuth().getBillingPortalUrl();
      window.location.href = url;
    } catch (err) {
      setPickError(err instanceof Error ? err.message : 'Could not open the billing portal.');
      setPortalLoading(false);
    }
  }

  const intervalTabs = showIntervalTabs ? (
    <div className="bridge-plan-interval-tabs" data-bridge-plan-interval-tabs="" role="group" aria-label="Billing interval">
      {availableIntervals.map((interval) => (
        <button
          key={interval}
          type="button"
          className="bridge-plan-interval-tab"
          data-active={interval === selectedInterval}
          aria-pressed={interval === selectedInterval}
          onClick={() => setIntervalOverride(interval)}
        >
          {INTERVAL_LABELS[interval]}
        </button>
      ))}
    </div>
  ) : null;

  return (
    <div
      className={className}
      style={style}
      data-bridge-plan-selector
      data-loading={loading || picking}
      data-state={uiState}
      {...rest}
    >
      {loading ? (
        loadingState ?? (
          <div className="bridge-plan-loading">
            <Spinner />
          </div>
        )
      ) : storeError ? (
        <Alert variant="error">{storeError}</Alert>
      ) : (
        <>
          {pickError && <Alert variant="error">{pickError}</Alert>}

          {successNotice && (
            <div className="bridge-plan-success" data-bridge-plan-success="" role="status">
              <Alert variant="success">{successNotice}</Alert>
            </div>
          )}

          {uiState === 'payment-failed' && (
            <div data-bridge-plan-payment-failed className="bridge-plan-payment-failed">
              <Alert variant="error">
                Your last payment failed. Please update your payment method to continue.
              </Alert>
              <button
                type="button"
                className="bridge-btn-primary bridge-plan-portal-btn"
                disabled={portalLoading}
                onClick={handleManageBilling}
              >
                Manage billing
              </button>
            </div>
          )}

          {plans && plans.length === 0 ? (
            emptyState ?? (
              <div className="bridge-plan-empty" data-bridge-plan-empty="">
                <p>The plans could not be loaded.</p>
                <button type="button" className="bridge-btn-primary" onClick={retryPlans} disabled={retrying}>
                  {retrying ? 'Loading…' : 'Try again'}
                </button>
              </div>
            )
          ) : plans ? (
            <>
              {heading ? (
                <div className="bridge-plan-head" data-bridge-plan-head="">
                  <h2 className="bridge-plan-heading">{heading}</h2>
                  {intervalTabs}
                </div>
              ) : (
                intervalTabs
              )}

              <div className="bridge-plan-cards" data-bridge-plan-cards>
                {sortedPlans.map((plan) => {
                  const isCurrent = plan.key === currentPlanKey;
                  const onPick = (price: PriceOfferSdk) => handlePick(plan, price);
                  const visiblePrices = pricesForInterval(plan);
                  const kind = pickKind(plan, currentPlan);
                  const buttonClass = `${
                    kind === 'current' || kind === 'switch' ? 'bridge-btn-secondary' : 'bridge-btn-primary'
                  } bridge-plan-select-btn`;
                  const features = planFeatures(plan);

                  if (planCard) {
                    return (
                      <div key={plan.key}>
                        {planCard({ plan, prices: plan.prices, isCurrent, interval: selectedInterval, onPick })}
                      </div>
                    );
                  }

                  return (
                    <div
                      key={plan.key}
                      data-bridge-plan-card
                      data-current={isCurrent}
                      data-trial={plan.trial}
                      data-pick={kind}
                      className="bridge-plan-card"
                    >
                      {isCurrent && (
                        <span className="bridge-plan-current-flag" data-bridge-plan-current-flag="">
                          Your plan
                        </span>
                      )}
                      <div className="bridge-plan-card-header">
                        <h3 className="bridge-plan-name">{plan.name}</h3>
                        {plan.trial && (plan.trialDays ?? 0) > 0 && (
                          <span className="bridge-plan-trial-badge">
                            {plan.trialDays}-day trial
                          </span>
                        )}
                      </div>

                      {visiblePrices[0] && (
                        <div className="bridge-plan-price" data-bridge-plan-price="">
                          <span className="bridge-plan-price-amount">
                            {formatAmount(visiblePrices[0].amount, visiblePrices[0].currency)}
                          </span>{' '}
                          <span className="bridge-plan-price-interval">{intervalSuffix(visiblePrices[0])}</span>
                        </div>
                      )}

                      {planDescription
                        ? planDescription({ plan, isCurrent })
                        : plan.description && (
                            <p className="bridge-plan-description">{plan.description}</p>
                          )}

                      {features.length > 0 && (
                        <ul
                          className="bridge-plan-features"
                          data-bridge-plan-features=""
                          aria-label={`Included in ${plan.name}`}
                        >
                          {features.map((feature) => (
                            <li key={feature.key} className="bridge-plan-feature" data-feature={feature.key}>
                              <svg
                                className="bridge-plan-feature-check"
                                width="14"
                                height="14"
                                viewBox="0 0 16 16"
                                aria-hidden="true"
                              >
                                <path
                                  d="M3 8.5l3.2 3L13 4.5"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                              <span>{feature.name}</span>
                            </li>
                          ))}
                        </ul>
                      )}

                      <div className="bridge-plan-prices">
                        {visiblePrices.map((price) => (
                          <button
                            key={price.id || price.recurrenceInterval + price.currency}
                            type="button"
                            className={buttonClass}
                            disabled={isCurrent || picking}
                            onClick={() => onPick(price)}
                          >
                            {pickLabel(kind, plan)}
                            {visiblePrices.length > 1 && !isCurrent
                              ? ` · ${formatAmount(price.amount, price.currency)}`
                              : null}
                          </button>
                        ))}

                        {plan.prices.length === 0 ? (
                          <button
                            type="button"
                            className={buttonClass}
                            disabled={isCurrent || picking}
                            onClick={() =>
                              handlePick(plan, { id: '', amount: 0, currency: 'usd', recurrenceInterval: 'month' })
                            }
                          >
                            {pickLabel(kind, plan)}
                          </button>
                        ) : visiblePrices.length === 0 ? (
                          <p className="bridge-plan-unavailable" data-bridge-plan-unavailable="">
                            Not available {INTERVAL_LABELS[selectedInterval].toLowerCase()}
                          </p>
                        ) : null}
                      </div>
                      {planFooter ? planFooter({ plan, isCurrent }) : null}
                    </div>
                  );
                })}
              </div>
            </>
          ) : null}
        </>
      )}

      {confirmTarget && (
        <div
          className="bridge-plan-confirm-backdrop"
          data-bridge-plan-confirm=""
          role="dialog"
          aria-modal="true"
          aria-labelledby="bridge-plan-confirm-title"
          tabIndex={-1}
        >
          <div className="bridge-plan-confirm">
            <h3 id="bridge-plan-confirm-title" className="bridge-plan-confirm-title">
              Change plan?
            </h3>
            <p className="bridge-plan-confirm-body">
              Switch from <strong>{currentPlanName}</strong> to <strong>{confirmTarget.plan.name}</strong> (
              {formatPrice(confirmTarget.price)}).
            </p>
            <p className="bridge-plan-confirm-note">
              The change takes effect immediately. Any price difference is prorated on your next invoice.
            </p>
            {confirmError && <Alert variant="error">{confirmError}</Alert>}
            <div className="bridge-plan-confirm-actions">
              <button
                type="button"
                className="bridge-btn-secondary"
                disabled={confirmBusy}
                onClick={() => setConfirmTarget(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="bridge-btn-primary"
                data-bridge-plan-confirm-btn=""
                disabled={confirmBusy}
                onClick={confirmPlanChange}
              >
                {confirmBusy ? 'Switching…' : 'Confirm change'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default PlanSelector;
