'use client';

/**
 * TBP-742 — what the upgrade dialog would show right now: a plan-limit refusal
 * (`402 QUOTA_EXCEEDED`) or a feature the plan lacks (a `<FeatureFlag upgrade>`
 * click, a `402 FEATURE_NOT_IN_PLAN`). For an app that turned the built-in
 * dialog off (`billing.upgradeDialog: false`) and renders its own.
 */
import { useCallback, useSyncExternalStore } from 'react';
import {
  dismissQuotaRefusal,
  getQuotaRefusal,
  subscribeQuotaRefusal,
  type BridgeQuotaRefusal,
} from '../../core/quota-refusal';
import {
  dismissFeatureUpgrade,
  getFeatureUpgrade,
  subscribeFeatureUpgrade,
  type BridgeFeatureUpgrade,
} from '../../core/feature-upgrade';

export interface UpgradeRequest {
  /** The plan-limit refusal, or `null`. */
  refusal: BridgeQuotaRefusal | null;
  /** The feature the plan lacks, or `null`. A refusal wins when both are set. */
  featureUpgrade: BridgeFeatureUpgrade | null;
  /** Close whatever is showing. */
  dismiss: () => void;
}

export function useUpgradeRequest(): UpgradeRequest {
  const refusal = useSyncExternalStore(subscribeQuotaRefusal, getQuotaRefusal, () => null);
  const featureUpgrade = useSyncExternalStore(subscribeFeatureUpgrade, getFeatureUpgrade, () => null);
  const dismiss = useCallback(() => {
    dismissQuotaRefusal();
    dismissFeatureUpgrade();
  }, []);
  return { refusal, featureUpgrade, dismiss };
}
