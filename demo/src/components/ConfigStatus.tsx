'use client';

import { useBridgeReady, useIsOnboarded } from '@nebulr-group/bridge-nextjs/client';

/**
 * Mirrors bridge-svelte's `ConfigStatus.svelte` — shows whether the bridge
 * provider has bootstrapped successfully and displays the configured appId.
 *
 * The full svelte version supports per-tab `localStorage:bridge:appId` overrides
 * for QA. The Next.js demo doesn't surface that yet — env var is the only path.
 */
export function ConfigStatus() {
  const ready = useBridgeReady();
  const isOnboarded = useIsOnboarded();
  const appId = process.env.NEXT_PUBLIC_BRIDGE_APP_ID;

  if (!appId) {
    return (
      <div className="feature-status">
        <p style={{ fontWeight: 'bold' }}>❌ Config Error</p>
        <p>No <code>NEXT_PUBLIC_BRIDGE_APP_ID</code> set.</p>
        <p style={{ marginTop: '0.5rem', fontSize: '0.875rem' }}>
          Set the env var in <code>.env.local</code> and restart the dev server.
        </p>
      </div>
    );
  }

  return (
    <div className="feature-status active">
      <p style={{ fontWeight: 'bold' }}>✅ Success</p>
      <p>
        Bridge configuration initialized with appId: <code>{appId}</code>
        {' '}<span style={{ fontSize: '0.75rem', color: '#6b7280' }}>(env var)</span>
      </p>
      <p style={{ fontSize: '0.8125rem', marginTop: '0.5rem' }}>
        Bootstrap ready: <strong>{ready ? 'yes' : 'no'}</strong>
        {' · '}Onboarded: <strong>{isOnboarded ? 'yes' : 'no (or unauthenticated)'}</strong>
      </p>
    </div>
  );
}

export default ConfigStatus;
