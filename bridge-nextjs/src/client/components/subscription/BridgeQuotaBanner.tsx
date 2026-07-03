'use client';

/**
 * Billing 2.0 / Phase C / US-11 (TBP-263) — ported from bridge-svelte's
 * `BridgeQuotaBanner.svelte`.
 *
 * Live "approaching cap" / "over cap" notice for a single metric. Reads
 * auth-core's `useBridge().quota(metric)` so initial hydration + live
 * `quota.updated` pushes flow into the UI without any consumer wiring.
 *
 * Renders NOTHING while:
 *   - the metric has no quota configured on the plan (server returns null), OR
 *   - usage is below 80% of the limit (warningLevel === null).
 *
 * Three visible states: approaching (80-94%) → 'warn', critical (95-99%) →
 * 'critical', over-cap (used > limit) → 'critical' (different copy).
 *
 * Two role variants (admin / member): admins get an Upgrade CTA; members get
 * an informational variant. Reuses the BridgeBillingNotice severity tokens.
 *
 * Reactive translation (§5.1): svelte `$state(quota(metric))` +
 * `onMount(quotas.subscribe)` + `$effect(re-hydrate on metric change)` →
 * `useSyncExternalStore` over the quota store + a `metric`-keyed `useEffect`;
 * `$derived(...)` → `useMemo`.
 */
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useBridge, type QuotaSnapshot } from '@nebulr-group/bridge-auth-core';
import { getBridgeAuth, getBridgeConfig } from '../../../core/bridge-instance';

type Chassis = 'rail';
type Severity = 'warn' | 'critical';

export interface BridgeQuotaBannerProps {
  /** Metric key to watch (e.g. 'ai_completions', 'bridge.active_users'). */
  metric: string;
  /**
   * Visual chassis variant. Only 'rail' is implemented in US-11; bar / card
   * variants land alongside the full design pack rollout.
   */
  chassis?: Chassis;
  /** Optional class applied to the root element. */
  className?: string;
  /** Override the default Upgrade CTA click handler. */
  onActionClick?: (snap: QuotaSnapshot) => void;
  /** CTA destination for this instance. Overrides `billing.manageRoute`
   *  config; `onActionClick` takes precedence over both. */
  actionHref?: string;
  /**
   * Optional display label override. Defaults to the snapshot's `.label` (raw
   * metric key for US-11; the framework wrapper will eventually supply a
   * humanized label).
   */
  label?: string;
}

export function BridgeQuotaBanner({
  metric,
  chassis = 'rail',
  className = '',
  onActionClick,
  actionHref,
  label,
}: BridgeQuotaBannerProps) {
  const bridgeBilling = useBridge();

  // Subscribe to the quota store; re-read `quota(metric)` on every push. The
  // store's `quota(metric)` triggers lazy hydration on first call (store
  // dedupes repeats), so reading it inside getSnapshot drives initial fetch.
  const lastRef = useRef<QuotaSnapshot | undefined>(undefined);
  const snapshot = useSyncExternalStore(
    (onChange) =>
      bridgeBilling.quotas.subscribe((m) => {
        if (m === metric) onChange();
      }),
    () => {
      const next = bridgeBilling.quota(metric);
      if (sameSnap(lastRef.current, next)) return lastRef.current;
      lastRef.current = next;
      return next;
    },
    () => lastRef.current,
  );

  // Role variant mirrors BridgeBillingNotice: any authenticated user is treated
  // as a billing admin for US-11 until the role/privilege API is finalized.
  const [isBillingAdmin, setIsBillingAdmin] = useState(false);

  useEffect(() => {
    try {
      const ctx = getBridgeAuth().getApiContext();
      if (ctx.accessToken) setIsBillingAdmin(true);
    } catch {
      // No BridgeAuth instance — render the member variant.
    }
  }, []);

  // Re-trigger hydration when the metric prop changes mid-mount (svelte
  // `$effect(() => { snapshot = quota(metric); })`).
  useEffect(() => {
    bridgeBilling.quota(metric);
    // bridgeBilling is the auth-core singleton — stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metric]);

  const warningLevel = snapshot?.warningLevel ?? null;
  const overCap = snapshot ? snapshot.used > snapshot.limit : false;
  const visible = snapshot !== undefined && warningLevel !== null;
  const severity: Severity =
    warningLevel === 'critical' || overCap ? 'critical' : 'warn';
  const displayLabel = label ?? snapshot?.label ?? metric;
  const percent = useMemo(
    () =>
      snapshot && snapshot.limit > 0
        ? Math.min(100, Math.round((snapshot.used / snapshot.limit) * 100))
        : 0,
    [snapshot],
  );

  const copy = useMemo(
    () => getCopy(snapshot, isBillingAdmin, displayLabel, warningLevel),
    [snapshot, isBillingAdmin, displayLabel, warningLevel],
  );

  function handleAction(): void {
    if (!snapshot) return;
    if (onActionClick) {
      onActionClick(snapshot);
      return;
    }
    // Destination priority: `actionHref` prop → `billing.manageRoute` config
    // → '/billing'.
    if (typeof window !== 'undefined') {
      let manageRoute: string | undefined;
      try {
        manageRoute = getBridgeConfig().billing?.manageRoute;
      } catch {
        // Config not initialized — fall through to the default.
      }
      window.location.href = actionHref ?? manageRoute ?? '/billing';
    }
  }

  if (!visible || !snapshot) return null;

  return (
    <div
      className={`bridge-quota-banner bqb-chassis-${chassis} bqb-severity-${severity} ${className}`.trim()}
      role={severity === 'critical' ? 'alert' : 'status'}
      aria-live={severity === 'critical' ? 'assertive' : 'polite'}
      aria-label={`${displayLabel} quota ${percent}% used`}
    >
      <div className="bqb-content">
        <strong className="bqb-title">{copy.title}</strong>
        <span className="bqb-body">{copy.body}</span>
        <div className="bqb-meter" aria-hidden="true">
          <div
            className="bqb-meter-fill"
            style={{ width: `${Math.min(100, percent)}%` }}
          />
        </div>
      </div>
      {copy.cta && isBillingAdmin && (
        <button type="button" className="bqb-cta" onClick={handleAction}>
          {copy.cta}
        </button>
      )}
    </div>
  );
}

function getCopy(
  snap: QuotaSnapshot | undefined,
  admin: boolean,
  displayLabel: string,
  warningLevel: QuotaSnapshot['warningLevel'] | null,
): { title: string; body: string; cta?: string } {
  if (!snap) return { title: '', body: '' };
  const over = snap.used > snap.limit;
  const remaining = Math.max(0, snap.remaining);
  if (over) {
    return admin
      ? {
          title: `${displayLabel} over cap`,
          body: `You've used ${snap.used.toLocaleString()} of ${snap.limit.toLocaleString()}. Upgrade your plan to add headroom.`,
          cta: 'Upgrade',
        }
      : {
          title: `${displayLabel} over cap`,
          body: `Your workspace is over its ${displayLabel} cap. Contact your workspace owner.`,
        };
  }
  if (warningLevel === 'critical') {
    return admin
      ? {
          title: `${displayLabel} near cap`,
          body: `You've used ${snap.used.toLocaleString()} of ${snap.limit.toLocaleString()} (${remaining.toLocaleString()} left). Upgrade to avoid hitting the cap.`,
          cta: 'Upgrade',
        }
      : {
          title: `${displayLabel} near cap`,
          body: `Your workspace is approaching its ${displayLabel} cap. Contact your workspace owner.`,
        };
  }
  // approaching
  return admin
    ? {
        title: `${displayLabel} approaching cap`,
        body: `You've used ${snap.used.toLocaleString()} of ${snap.limit.toLocaleString()} (${remaining.toLocaleString()} left).`,
        cta: 'Upgrade',
      }
    : {
        title: `${displayLabel} approaching cap`,
        body: `Your workspace is approaching its ${displayLabel} cap.`,
      };
}

function sameSnap(a: QuotaSnapshot | undefined, b: QuotaSnapshot | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.used === b.used &&
    a.limit === b.limit &&
    a.remaining === b.remaining &&
    a.warningLevel === b.warningLevel &&
    a.label === b.label
  );
}

export default BridgeQuotaBanner;
