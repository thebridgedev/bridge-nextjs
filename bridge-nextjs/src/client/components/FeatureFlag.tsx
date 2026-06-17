'use client';

// bridge-nextjs — declarative component for Bridge feature flags (FF 2.0).
//
// React translation of bridge-svelte's `FeatureFlag.svelte` (§5.1 / §5.4).
//
//   - svelte `children` snippet  → React `children` (node or render-prop `(value) => node`)
//   - svelte `fallback` snippet  → React `fallback` (node or render-prop)
//   - svelte `$derived.by(() => { _flagVersionsRune().get(key); evaluateFlag(...) })`
//     → `useFlag(...)` (useSyncExternalStore over the registry change-bus)
//
// Prop naming note: React reserves the literal prop name `key` for its
// reconciliation — a component can never receive a prop called `key`. The
// flag key is therefore passed as `flagKey`. All other props mirror svelte
// (`defaultValue`, `context`). The legacy `flagName` / `negate` / `forceLive`
// props are intentionally GONE (hard-replace, no deprecated shim).

import { ReactNode } from 'react';
import type { EvalContext } from '@nebulr-group/bridge-auth-core';
import { useFlag } from '../../flags/use-flag';

type FlagChild<T> = ReactNode | ((value: T) => ReactNode);

export interface FeatureFlagProps<T = boolean> {
  /**
   * The flag key to evaluate. Named `flagKey` rather than `key` because React
   * reserves `key` for reconciliation and never forwards it to a component.
   */
  flagKey: string;
  /** Developer-supplied default returned until the cache resolves / when off. */
  defaultValue: T;
  /**
   * Optional per-call EvalContext. Use when a flag's rule targets dev-supplied
   * attributes (e.g. `{ attributes: { plan } }`). Per-call attributes win on
   * key collision over Bridge-managed providers.
   */
  context?: Partial<EvalContext>;
  /** Rendered when the rule passed. Node, or a render-prop `(value) => node`. */
  children?: FlagChild<T>;
  /** Rendered when the flag is off / no rule matched. Node or render-prop. */
  fallback?: FlagChild<T>;
}

function render<T>(child: FlagChild<T> | undefined, value: T): ReactNode {
  if (child === undefined) return null;
  return typeof child === 'function' ? (child as (v: T) => ReactNode)(value) : child;
}

/**
 * Conditionally render based on a Bridge feature flag.
 *
 * @example
 * <FeatureFlag flagKey="new-dashboard" defaultValue={false}>
 *   <NewDashboard />
 * </FeatureFlag>
 *
 * @example
 * <FeatureFlag flagKey="ui-theme" defaultValue="light-mode">
 *   {(value) => <App theme={value} />}
 * </FeatureFlag>
 *
 * @example
 * <FeatureFlag flagKey="plan-flag" defaultValue={false} context={{ attributes: { plan } }}>
 *   {() => <Enterprise />}
 * </FeatureFlag>
 */
export function FeatureFlag<T = boolean>({
  flagKey,
  defaultValue,
  context,
  children,
  fallback,
}: FeatureFlagProps<T>) {
  const { value, passed } = useFlag<T>(flagKey, defaultValue, context);
  return <>{passed ? render(children, value) : render(fallback, value)}</>;
}

export default FeatureFlag;
