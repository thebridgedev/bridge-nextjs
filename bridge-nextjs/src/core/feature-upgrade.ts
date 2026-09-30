/**
 * TBP-742 (port of bridge-svelte TBP-756) — "this feature is not on your plan",
 * as an event the upgrade dialog listens to.
 *
 * Owner rule: nothing opens by itself. The dialog's feature variant opens only
 * when the person does something gated:
 *   - clicks the upgrade prompt a `<FeatureFlag>` shows (its `fallback`
 *     render-prop's `openUpgrade`, or the opt-in `upgrade` prompt);
 *   - makes a request the backend refuses with `402 FEATURE_NOT_IN_PLAN`
 *     (bridge-nestjs's flag guards).
 * A hidden feature with no fallback opens nothing.
 */
import { safeFixPath } from './safe-fix-path';

/** Why a feature is off, as Bridge reports it. */
export type BridgeFeatureOffReason = 'plan' | 'permission' | 'off' | 'rule' | 'rollout';

/** A request to show the upgrade dialog for a feature the plan does not include. */
export interface BridgeFeatureUpgrade {
  /** The feature flag that is off. */
  flag: string | null;
  /** The plan feature the flag's rule asks for, when it names one. */
  feature: string | null;
  /** Where to upgrade, from a backend refusal's `fix` (a same-app path), else null. */
  fix: string | null;
}

let _current: BridgeFeatureUpgrade | null = null;
const _watchers = new Set<() => void>();

function changed(): void {
  for (const w of [..._watchers]) w();
}

/** The feature upgrade the dialog is showing, or `null`. */
export function getFeatureUpgrade(): BridgeFeatureUpgrade | null {
  return _current;
}

/** Subscribe to changes of {@link getFeatureUpgrade} (the `useSyncExternalStore` shape). */
export function subscribeFeatureUpgrade(onChange: () => void): () => void {
  _watchers.add(onChange);
  return () => {
    _watchers.delete(onChange);
  };
}

/**
 * Open the upgrade dialog for a feature the plan does not include. Call it from
 * a click; a render must never call it (nothing opens by itself).
 */
export function openFeatureUpgrade(
  request: { flag?: string | null; feature?: string | null; fix?: string | null } = {},
): void {
  _current = {
    flag: request.flag ?? null,
    feature: request.feature ?? null,
    fix: safeFixPath(request.fix),
  };
  changed();
}

/** Close the feature variant of the upgrade dialog. */
export function dismissFeatureUpgrade(): void {
  if (_current === null) return;
  _current = null;
  changed();
}

/**
 * The upgrade request in a `402 FEATURE_NOT_IN_PLAN` body (bridge-nestjs), or
 * null when the body is something else.
 */
export function parseFeatureRefusal(body: unknown): BridgeFeatureUpgrade | null {
  if (typeof body !== 'object' || body === null) return null;
  const b = body as Record<string, unknown>;
  if (b.code !== 'FEATURE_NOT_IN_PLAN') return null;
  return {
    flag: typeof b.flag === 'string' && b.flag ? b.flag : null,
    feature: typeof b.feature === 'string' && b.feature ? b.feature : null,
    fix: safeFixPath(b.fix),
  };
}

/** Test-only: forget the current request. */
export function __resetFeatureUpgradeForTests(): void {
  _current = null;
  changed();
}
