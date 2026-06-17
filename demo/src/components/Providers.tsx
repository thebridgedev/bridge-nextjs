'use client';

import { BridgeProvider } from '@nebulr-group/bridge-nextjs/client';
import { useMemo, type ReactNode } from 'react';
import { BridgeWindowExpose } from './BridgeWindowExpose';
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
 * appId still comes from `NEXT_PUBLIC_BRIDGE_APP_ID` via BridgeProvider's
 * env-config reader — only the paywall wiring is added here.
 */
export function Providers({ children }: { children: ReactNode }) {
  // Memoize so the config object identity is stable across renders — otherwise
  // BridgeProvider's internal useMemo([config]) recomputes every render.
  const config = useMemo(
    () => ({
      billing: { paywallRoute: '/welcome', paymentErrorRoute: '/payment-error' },
    }),
    [],
  );

  return (
    <BridgeProvider config={config}>
      <BridgeWindowExpose />
      <Navbar />
      <main>{children}</main>
    </BridgeProvider>
  );
}
