'use client';

import { HttpError, type Plan, type PriceOfferSdk } from '@nebulr-group/bridge-auth-core';
import type { HTMLAttributes, ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import {
  getBridgeAuth,
  loadSubscription,
  useBridgeStore,
} from '../../../core/bridge-instance';
import { Alert } from '../sdk-auth/shared/Alert';
import { Spinner } from '../sdk-auth/shared/Spinner';

type UiState =
  | 'idle'
  | 'payment-failed'
  | 'setup-payments'
  | 'select-plan'
  | 'active'
  | 'trial';

interface Props extends Omit<HTMLAttributes<HTMLDivElement>, 'onSelect'> {
  successUrl: string;
  cancelUrl: string;
  onSelect?: (detail: { plan: Plan; price: PriceOfferSdk }) => void;
  planCard?: (ctx: {
    plan: Plan;
    prices: PriceOfferSdk[];
    isCurrent: boolean;
    onPick: (price: PriceOfferSdk) => void;
  }) => ReactNode;
  emptyState?: ReactNode;
  loadingState?: ReactNode;
}

export function PlanSelector({
  successUrl,
  cancelUrl,
  onSelect,
  planCard,
  emptyState,
  loadingState,
  className,
  style,
  ...rest
}: Props) {
  const subscription = useBridgeStore((s) => s.subscription);
  const { status, plans, loading, error: storeError } = subscription;
  const billing = useBridgeStore((s) => s.billing);

  const [picking, setPicking] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);

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

  useEffect(() => {
    if (!status && !loading) {
      void loadSubscription();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handlePick(plan: Plan, price: PriceOfferSdk): Promise<void> {
    setPicking(true);
    setPickError(null);
    try {
      if (price.amount === 0) {
        await getBridgeAuth().selectFreePlan(plan.key);
        await loadSubscription();
        onSelect?.({ plan, price });
      } else if (status?.paymentsEnabled) {
        await getBridgeAuth().changePlan(plan.key, price);
        await loadSubscription();
        onSelect?.({ plan, price });
      } else {
        const session = await getBridgeAuth().startCheckout(plan.key, price, {
          successUrl,
          cancelUrl,
        });
        if (!session.sessionId) {
          // Stripe not configured — plan was set directly on the backend
          await loadSubscription();
          onSelect?.({ plan, price });
        } else {
          // Redirect to the Stripe-hosted Checkout URL returned by auth-core.
          // (Stripe.js removed `redirectToCheckout({ sessionId })` on
          // 2025-09-30 — use the checkout URL directly, mirroring bridge-svelte.)
          if (!session.checkoutUrl) throw new Error('Checkout session URL missing');
          window.location.href = session.checkoutUrl;
        }
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
          window.location.href = billing.paywallRoute;
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
            emptyState ?? <p className="bridge-plan-empty">No plans available.</p>
          ) : plans ? (
            <div className="bridge-plan-cards" data-bridge-plan-cards>
              {plans.map((plan) => {
                const isCurrent = plan.key === currentPlanKey;
                const onPick = (price: PriceOfferSdk) => handlePick(plan, price);

                if (planCard) {
                  return (
                    <div key={plan.key}>
                      {planCard({ plan, prices: plan.prices, isCurrent, onPick })}
                    </div>
                  );
                }

                return (
                  <div
                    key={plan.key}
                    data-bridge-plan-card
                    data-current={isCurrent}
                    data-trial={plan.trial}
                    className="bridge-plan-card"
                  >
                    <div className="bridge-plan-card-header">
                      <h3 className="bridge-plan-name">{plan.name}</h3>
                      {plan.trial && (plan.trialDays ?? 0) > 0 && (
                        <span className="bridge-plan-trial-badge">
                          {plan.trialDays}-day trial
                        </span>
                      )}
                    </div>

                    {plan.description && (
                      <p className="bridge-plan-description">{plan.description}</p>
                    )}

                    <div className="bridge-plan-prices">
                      {plan.prices.map((price) => (
                        <button
                          key={price.id ?? price.recurrenceInterval + price.currency}
                          type="button"
                          className="bridge-btn-primary bridge-plan-select-btn"
                          disabled={isCurrent || picking}
                          onClick={() => onPick(price)}
                        >
                          {isCurrent
                            ? 'Current plan'
                            : price.amount === 0
                            ? 'Select free plan'
                            : `${price.amount} ${price.currency.toUpperCase()} / ${price.recurrenceInterval}`}
                        </button>
                      ))}

                      {plan.prices.length === 0 && (
                        <button
                          type="button"
                          className="bridge-btn-primary bridge-plan-select-btn"
                          disabled={isCurrent || picking}
                          onClick={() => getBridgeAuth().selectFreePlan(plan.key).then(() => loadSubscription())}
                        >
                          {isCurrent ? 'Current plan' : 'Select plan'}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

export default PlanSelector;
