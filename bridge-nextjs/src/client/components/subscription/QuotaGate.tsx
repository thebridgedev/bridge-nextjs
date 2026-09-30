'use client';

/**
 * TBP-742 (port of bridge-svelte TBP-703) — `<QuotaGate metric="tickets">`:
 * level 1. The action inside is disabled once the workspace is at its plan's
 * hard cap, and an upgrade line shows beside it.
 *
 *   <QuotaGate metric="tickets">
 *     <button onClick={createTicket}>New ticket</button>
 *   </QuotaGate>
 *
 *   <QuotaGate metric="tickets" atLimit={(q) => <>{q.used} of {q.limit} used. <a href="/subscription">Upgrade</a></>}>
 *     …
 *   </QuotaGate>
 *
 * Disabling is done by a `<fieldset disabled>` around the children, so every
 * button, input, select and textarea inside is disabled natively and announced
 * as such — no prop threading into your markup. (Links are not form controls;
 * put a link's action behind a button.)
 *
 * Never disables on "don't know yet": while the quota is loading, the plan has
 * no quota on the metric, or the quota is metered (it bills overage instead of
 * blocking), the children are enabled. Only a known hard cap with nothing left
 * disables them.
 *
 * Decoration only. The backend's `@RequireQuota` is what refuses the write.
 */
import type { ReactNode } from 'react';
import { useQuota, type QuotaState } from '../../hooks/use-quota';
import { billingRoutes } from '../../billing-routes';

export interface QuotaGateProps {
  /** The quota metric key, e.g. `'tickets'`. */
  metric: string;
  /** The action(s) to disable at the cap. */
  children: ReactNode;
  /** What to show at the cap, instead of the default "limit reached — Upgrade" line. */
  atLimit?: (quota: QuotaState) => ReactNode;
  /** Class on the wrapper. */
  className?: string;
}

export type QuotaGateState = 'loading' | 'unlimited' | 'metered' | 'available' | 'at-limit';

/** The gate's state for a quota. Exported for tests and custom gates. */
export function quotaGateState(quota: QuotaState): QuotaGateState {
  if (quota.loading) return 'loading';
  if (quota.unlimited) return 'unlimited';
  if ((quota.snapshot as { policy?: string } | null)?.policy === 'metered') return 'metered';
  const atCap =
    (quota.remaining !== null && quota.remaining <= 0) ||
    (quota.used !== null && quota.limit !== null && quota.used >= quota.limit);
  return atCap ? 'at-limit' : 'available';
}

export function QuotaGate({ metric, children, atLimit, className = '' }: QuotaGateProps) {
  const quota = useQuota(metric);
  const state = quotaGateState(quota);
  const blocked = state === 'at-limit';

  return (
    <div
      className={`bridge-quota-gate ${className}`.trim()}
      data-bridge-quota-gate=""
      data-metric={metric}
      data-state={state}
    >
      <fieldset disabled={blocked} className="bridge-quota-gate-controls" style={{ display: 'contents' }}>
        {children}
      </fieldset>
      {blocked ? (
        <div className="bridge-quota-gate-limit" data-bridge-quota-gate-limit="" role="status">
          {atLimit ? (
            atLimit(quota)
          ) : (
            <>
              You&apos;ve used all {quota.limit?.toLocaleString()} {metric} on your plan.{' '}
              <a href={billingRoutes().manageRoute}>Upgrade</a>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

export default QuotaGate;
