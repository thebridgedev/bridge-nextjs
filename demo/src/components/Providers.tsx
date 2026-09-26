'use client';

import { BridgeProvider } from '@nebulr-group/bridge-nextjs/client';
import { useMemo, type ReactNode } from 'react';
import { BridgeWindowExpose } from './BridgeWindowExpose';
import { readStoredAppId } from './demo-app-id';
import Navbar from './Navbar';

/**
 * Client-side provider wrapper.
 *
 * The Bridge config (including `billing.paywallRoute`) is defined HERE, inside a
 * client component, rather than as an inline object prop in the Server-Component
 * root layout. Passing a nested config object across the Server→Client boundary
 * is brittle for runtime-only fields like `billing`; defining it in client code
 * guarantees BridgeProvider receives it. This mirrors bridge-svelte, where the
 * config (with `billing: { paywallRoute: '/welcome' }`) is assembled in the
 * client-side `+layout.ts` load.
 *
 * appId comes from `NEXT_PUBLIC_BRIDGE_APP_ID` via BridgeProvider's env-config
 * reader when that is set. When it is empty — as it is in the E2E env files —
 * the id seeded into `localStorage['bridge:appId']` by the Playwright harness is
 * passed as the `appId` prop instead (see `demo-app-id.ts`).
 */
export function Providers({ children }: { children: ReactNode }) {
  // Read once per mount. `undefined` on the server render, which never
  // initializes the SDK; the client render that does init reads the real value.
  const storedAppId = useMemo(() => readStoredAppId(), []);

  // Memoize so the config object identity is stable across renders — otherwise
  // BridgeProvider's internal useMemo([config]) recomputes every render.
  const config = useMemo(
    () => ({
      billing: { paywallRoute: '/welcome', paymentErrorRoute: '/payment-error' },
    }),
    [],
  );

  return (
    <BridgeProvider appId={storedAppId} config={config}>
      <BridgeWindowExpose />
      <Navbar />
      <main>{children}</main>
    </BridgeProvider>
  );
}
