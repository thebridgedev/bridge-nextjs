'use client';

/**
 * TBP-742 — the part of `<BridgeProvider>` that shows the upgrade dialog: reads
 * the current refusal / feature request, decides who may upgrade and where the
 * button goes, and renders the built-in dialog or the app's own
 * (`billing.upgradeDialog`). Nothing when `billing.upgradeDialog: false`.
 */
import { useEffect, useState } from 'react';
import type { BridgeConfig, PlanWithFeatures } from '../../../shared/types/config';
import { getBridgeAuth, useBridgeStore } from '../../../core/bridge-instance';
import { isBillingAdmin } from '../../billing-role';
import { resolveUpgradeDialog, upgradeHrefFor } from '../../upgrade-dialog';
import { useUpgradeRequest } from '../../hooks/use-upgrade-request';
import { BridgeUpgradeDialog } from './BridgeUpgradeDialog';

export function UpgradeDialogHost({ billing }: { billing: BridgeConfig['billing'] | undefined }) {
  const { refusal, featureUpgrade, dismiss } = useUpgradeRequest();
  const storePlans = useBridgeStore((s) => s.subscription.plans) as PlanWithFeatures[] | null;
  const [fetchedPlans, setFetchedPlans] = useState<PlanWithFeatures[] | null>(null);
  const feature = featureUpgrade ? (featureUpgrade.feature ?? featureUpgrade.flag) : null;
  const open = !!refusal || !!featureUpgrade;

  // The feature variant names the plans that include the feature; fetch the
  // plan list once when it opens and nothing has loaded it yet.
  useEffect(() => {
    if (!featureUpgrade || storePlans || fetchedPlans) return;
    let cancelled = false;
    try {
      void getBridgeAuth()
        .getPlans()
        .then((p) => {
          if (!cancelled) setFetchedPlans(p as PlanWithFeatures[]);
        })
        .catch(() => {});
    } catch {
      /* not initialised */
    }
    return () => {
      cancelled = true;
    };
  }, [featureUpgrade, storePlans, fetchedPlans]);

  const Dialog = resolveUpgradeDialog(billing);
  if (Dialog === null) return null;
  const props = {
    refusal,
    upgradeHref: upgradeHrefFor(refusal ?? featureUpgrade, billing),
    canUpgrade: open ? isBillingAdmin() : false,
    onClose: dismiss,
    feature: refusal ? null : feature,
    plans: storePlans ?? fetchedPlans,
  };
  if (Dialog === 'default') return <BridgeUpgradeDialog {...props} />;
  return <Dialog {...props} />;
}
