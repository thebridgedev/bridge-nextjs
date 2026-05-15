'use client';

import type { Plan, PriceOfferSdk } from '@nebulr-group/bridge-auth-core';
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

  const [picking, setPicking] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);

  const uiState: UiState = useMemo(() => {
    if (!status) return 'idle';
    if (status.paymentFailed) return 'payment-failed';
    if (status.shouldSetupPayments) return 'setup-payments';
    if (status.shouldSelectPlan) return 'select-plan';
    if (status.trial) return 'trial';
    if (status.paymentsEnabled || status.plan) return 'active';
    return 'select-plan';
  }, [status]);

  const currentPlanKey = status?.plan ?? null;

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
          await loadSubscription();
          onSelect?.({ plan, price });
        } else {
          // `@stripe/stripe-js` is an optional peer dep. Consumers using
          // hosted Stripe Checkout must install it themselves.
          // @ts-ignore — module resolved at runtime in the consuming app
          const { loadStripe } = await import('@stripe/stripe-js');
          const stripe = await loadStripe(session.publicKey);
          if (!stripe) throw new Error('Failed to load Stripe');
          // `redirectToCheckout` is deprecated in Stripe types ≥ v8 but still
          // works at runtime. Cast to bypass the type-deprecation while we keep
          // session-id flow compatibility with auth-core's startCheckout shape.
          await (stripe as any).redirectToCheckout({ sessionId: session.sessionId });
        }
      }
    } catch (err) {
      setPickError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setPicking(false);
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
