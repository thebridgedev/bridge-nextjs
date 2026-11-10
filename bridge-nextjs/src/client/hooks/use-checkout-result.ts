'use client';

/**
 * TBP-946 (port of bridge-svelte TBP-813) — the checkout that just completed,
 * for a message of your own: `{ kind: 'checkout' | 'plan', planName? }`, or
 * `null`. Reading it does not clear it; call `takeCheckoutResult()` (or
 * `clearCheckoutResult()`) once you have shown it, so it shows once.
 * `<BridgeCheckoutNotice>` does that for you.
 */
import { checkoutResult, type BridgeCheckoutResult } from '../checkout-result';
import { useBridgeReadable } from './use-bridge-readable';

export function useCheckoutResult(): BridgeCheckoutResult | null {
  return useBridgeReadable(checkoutResult) ?? null;
}
