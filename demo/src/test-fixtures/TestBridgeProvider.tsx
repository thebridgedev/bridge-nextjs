'use client';

import { BridgeProvider, type BridgeProviderProps } from '@nebulr-group/bridge-nextjs/client';
import { useMemo } from 'react';
import { readStoredAppId } from './demo-app-id';

/**
 * Demo-only (the counterpart of bridge-svelte's `withTestFixtures`): the E2E
 * harness seeds each Playwright worker's app id into localStorage at run time
 * (TBP-721), which only client code can read. A real app renders
 * `<BridgeProvider>` straight from its Server Component `app/layout.tsx`.
 *
 * The stored id is used only when `NEXT_PUBLIC_BRIDGE_APP_ID` is empty (the
 * test env files leave it empty): an explicit `appId` prop wins over the
 * environment (TBP-742), so passing it unconditionally would let a leftover
 * e2e id override a developer's own .env.local.
 */
export function TestBridgeProvider(props: BridgeProviderProps) {
  const storedAppId = useMemo(
    () => (process.env.NEXT_PUBLIC_BRIDGE_APP_ID ? undefined : readStoredAppId()),
    [],
  );
  return <BridgeProvider {...props} appId={props.appId ?? storedAppId} />;
}
