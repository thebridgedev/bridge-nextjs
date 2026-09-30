'use client';

// TBP-763 — seat limits on the built-in team page. Port of bridge-svelte's
// `components/team/seats.ts`.
//
// Seats are a plan limit the app names (for example `seats`): a gauge Bridge
// counts itself from membership — active members plus pending invites — which
// the quota snapshot marks `source: 'membership'`. Bridge's invite API does not
// refuse at the limit, so the team page runs the check itself when given the
// limit's name (`seatsMetric`):
//   - Add Member stops at the plan's limit with a line saying why;
//   - one invite of several addresses cannot jump past the limit either;
//   - after an invite, removal, or enable/disable the seat quota is re-read, so
//     the page follows the team (a live `quota.updated` push may arrive too).

import { useEffect, useRef, useSyncExternalStore } from 'react';
import { useBridge, type QuotaSnapshot } from '@nebulr-group/bridge-auth-core';
import { logger } from '../../../shared/logger';

/**
 * Why an invite of `count` addresses is refused with `remaining` seats left,
 * or null when it fits. `remaining` null = unknown (loading / no limit): the
 * page does not guess — the check is a courtesy, the limit is the plan's.
 */
export function inviteSeatError(count: number, remaining: number | null | undefined): string | null {
  if (remaining === null || remaining === undefined) return null;
  const left = Math.max(0, remaining);
  if (count <= left) return null;
  if (left === 0) return 'All seats on your plan are taken. Upgrade your plan to invite more people.';
  return `Your plan has ${left} ${left === 1 ? 'seat' : 'seats'} left, and this invites ${count}. Invite fewer people or upgrade your plan.`;
}

/**
 * Seats left on the plan, or null when there is no cap to enforce here:
 * no metric, still loading, no quota on the plan, or a metered quota (extra
 * seats are billed, not refused).
 */
export function seatsLeftOf(snapshot: QuotaSnapshot | undefined): number | null {
  if (!snapshot || snapshot.policy === 'metered') return null;
  return typeof snapshot.remaining === 'number' ? snapshot.remaining : null;
}

/** The line shown when every seat is taken. Pending invites count when Bridge counts from membership. */
export function seatsAtLimitMessage(snapshot: QuotaSnapshot): string {
  const all = typeof snapshot.limit === 'number' ? `All ${snapshot.limit.toLocaleString()}` : 'All';
  const counted = snapshot.source === 'membership' ? ' (pending invites count)' : '';
  return `${all} seats on your plan are taken${counted}.`;
}

/** After the team changed: re-read the seat count, when the page counts seats. */
export function seatsChanged(seatsMetric: string | undefined): void {
  if (!seatsMetric) return;
  try {
    useBridge().quotas.reconcileAfterReport(seatsMetric, 0);
  } catch (err) {
    logger.debug('[bridge-team] seat quota re-read skipped:', err);
  }
}

/** The live seat quota snapshot for `seatsMetric`; undefined without one or while loading. */
export function useSeatsQuota(seatsMetric: string | undefined): QuotaSnapshot | undefined {
  const lastRef = useRef<QuotaSnapshot | undefined>(undefined);
  const snapshot = useSyncExternalStore(
    (onChange) => {
      if (!seatsMetric) return () => {};
      try {
        return useBridge().quotas.subscribe((m) => {
          if (m === seatsMetric) onChange();
        });
      } catch {
        return () => {};
      }
    },
    () => {
      if (!seatsMetric) return undefined;
      let next: QuotaSnapshot | undefined;
      try {
        next = useBridge().quotas.get(seatsMetric);
      } catch {
        next = undefined;
      }
      if (next === lastRef.current) return lastRef.current;
      lastRef.current = next;
      return next;
    },
    () => undefined,
  );

  // First read hydrates (one GET); no metric, no read.
  useEffect(() => {
    if (!seatsMetric) return;
    try {
      useBridge().quota(seatsMetric);
    } catch {
      // No billing bridge — no seat count, no cap.
    }
  }, [seatsMetric]);

  return snapshot;
}
