'use client';

/**
 * TBP-742 (port of bridge-svelte TBP-703) — `<Entitled to="analytics">`: the
 * children render when the workspace's plan grants the entitlement, `fallback`
 * when it does not.
 *
 *   <Entitled to="analytics" fallback={<a href="/subscription">Upgrade for analytics</a>}>
 *     <AnalyticsPanel />
 *   </Entitled>
 *
 * Until Bridge has answered it renders neither — only the optional `loading` —
 * so a cold start never flashes the upgrade prompt at a paying workspace, nor
 * the paid feature at a free one.
 *
 * It reads the plan directly, which is the exception: the standard gate is
 * `<FeatureFlag flagKey>` with a flag ruled `bridge:billing.entitlement.<key>
 * eq true`. In development it logs a one-time note saying so.
 */
import type { ReactNode } from 'react';
import { useEntitlements } from '../../hooks/use-entitlements';
import { noteDirectPlanCheck } from '../../../core/direct-plan-check-note';

export interface EntitledProps {
  /** The entitlement key, e.g. `'analytics'`. */
  to: string;
  /** Rendered when the plan grants `to`. */
  children: ReactNode;
  /** Rendered when Bridge has answered and the plan does not grant `to`. */
  fallback?: ReactNode;
  /** Rendered until Bridge has answered. Nothing by default. */
  loading?: ReactNode;
}

export function Entitled({ to, children, fallback = null, loading = null }: EntitledProps) {
  noteDirectPlanCheck('entitled', to);
  const entitlements = useEntitlements();
  if (!entitlements.ready) return <>{loading}</>;
  return <>{entitlements.all[to] === true ? children : fallback}</>;
}

export default Entitled;
