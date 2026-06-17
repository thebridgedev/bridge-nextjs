'use client';

import { useEffect, useState } from 'react';
import {
  useBridge,
  type UserSnapshot,
  type SubscriptionSnapshot,
} from '@nebulr-group/bridge-nextjs/client';

/**
 * Demonstrates the unified `bridge` read surface. Subscribes to the
 * session.snapshot-backed readables (`bridge.tenant.*`, `bridge.user`) and
 * renders them once the live channel delivers a snapshot after authenticated
 * bootstrap. Mirrors bridge-svelte's `+page.svelte` unified-surface block.
 */
export function BridgeSurfaceStatus() {
  const bridge = useBridge();
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [tenantName, setTenantName] = useState<string | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionSnapshot | null>(null);
  const [user, setUser] = useState<UserSnapshot | null>(null);

  useEffect(() => {
    const unsubs = [
      bridge.tenant.id.subscribe(setTenantId),
      bridge.tenant.name.subscribe(setTenantName),
      bridge.tenant.subscription.subscribe(setSubscription),
      bridge.user.subscribe(setUser),
    ];
    return () => unsubs.forEach((u) => u());
  }, [bridge]);

  if (!tenantId && !user) return null;

  return (
    <div className="card" data-testid="bridge-surface-status">
      <h3 className="heading-md">Live Bridge Surface</h3>
      <ul>
        <li>Workspace: {tenantName ?? tenantId ?? '—'}</li>
        <li>Plan: {subscription?.plan.name ?? '—'}</li>
        <li>Signed in as: {user?.email ?? user?.id ?? '—'}</li>
      </ul>
    </div>
  );
}
