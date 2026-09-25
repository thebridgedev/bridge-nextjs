'use client';

import { useEffect, useState } from 'react';
import { useBridgeReady, useIsOnboarded } from '@nebulr-group/bridge-nextjs/client';
import { APP_ID_STORAGE_KEY, readStoredAppId } from './demo-app-id';

/**
 * Mirrors bridge-svelte's `ConfigStatus.svelte` — shows whether the bridge
 * provider has bootstrapped successfully and displays the app id in use.
 *
 * The app id is `NEXT_PUBLIC_BRIDGE_APP_ID` when set, otherwise the one seeded
 * into `localStorage['bridge:appId']` (the E2E harness path — see
 * `demo-app-id.ts`). The same precedence BridgeProvider applies.
 *
 * The env pill states which backend this demo build talks to. The Playwright
 * global-setup asserts it against the project it is running, so a demo started
 * with another environment's env file fails the run loudly instead of quietly
 * measuring the wrong backend (TBP-721 — the stage suite used to drive the
 * browser at the local API).
 */
export function ConfigStatus() {
  const ready = useBridgeReady();
  const isOnboarded = useIsOnboarded();
  const envAppId = process.env.NEXT_PUBLIC_BRIDGE_APP_ID || undefined;
  const environment = process.env.NEXT_PUBLIC_DEMO_ENVIRONMENT || 'unset';
  const apiBaseUrl = process.env.NEXT_PUBLIC_BRIDGE_API_BASE_URL || '';

  // localStorage only exists after mount; reading it during render would make
  // the server and client markup disagree.
  const [storedAppId, setStoredAppId] = useState<string | undefined>(undefined);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setStoredAppId(readStoredAppId());
    setMounted(true);
  }, []);

  const appId = envAppId ?? storedAppId;
  const source = envAppId ? 'env var' : `localStorage:${APP_ID_STORAGE_KEY}`;

  const envPill = (
    <span
      className="env-pill"
      data-env={environment}
      data-api-base-url={apiBaseUrl}
      style={{ fontSize: '0.75rem', color: '#6b7280', marginLeft: '0.5rem' }}
    >
      env: {environment} · api: {apiBaseUrl || 'SDK default'}
    </span>
  );

  if (!appId) {
    if (!mounted) {
      return (
        <div className="feature-status">
          <p style={{ fontWeight: 'bold' }}>Loading Bridge config… {envPill}</p>
        </div>
      );
    }
    return (
      <div className="feature-status">
        <p style={{ fontWeight: 'bold' }}>❌ Config Error {envPill}</p>
        <p>
          No <code>NEXT_PUBLIC_BRIDGE_APP_ID</code> set and no{' '}
          <code>localStorage[&apos;{APP_ID_STORAGE_KEY}&apos;]</code>.
        </p>
        <p style={{ marginTop: '0.5rem', fontSize: '0.875rem' }}>
          Set the env var in <code>config/.env.local</code> and restart the dev server.
        </p>
      </div>
    );
  }

  return (
    <div className="feature-status active">
      <p style={{ fontWeight: 'bold' }}>✅ Success {envPill}</p>
      <p>
        Bridge configuration initialized with appId:{' '}
        <code data-testid="bridge-app-id">{appId}</code>
        {' '}<span style={{ fontSize: '0.75rem', color: '#6b7280' }}>({source})</span>
      </p>
      <p style={{ fontSize: '0.8125rem', marginTop: '0.5rem' }}>
        Bootstrap ready: <strong>{ready ? 'yes' : 'no'}</strong>
        {' · '}Onboarded: <strong>{isOnboarded ? 'yes' : 'no (or unauthenticated)'}</strong>
      </p>
    </div>
  );
}

export default ConfigStatus;
