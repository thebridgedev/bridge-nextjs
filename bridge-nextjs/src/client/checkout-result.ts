// TBP-946 (port of bridge-svelte TBP-813) — "a checkout just finished", for
// whichever page it lands on.
//
// A completed checkout used to stop on a confirmation page (`/subscription/success`)
// before going anywhere. It now lands on `billing.successRoute` (the subscription
// page by default), and this one-shot signal is how that page knows to say so:
// `<BridgeCheckoutNotice>` shows it as a banner, and an app that wants its own
// message reads `checkoutResult` (or `useCheckoutResult()`).
//
// In memory only, never in the URL or storage. Next.js difference: Stripe
// returns with a full page load, so the signal is set when `<BridgeProvider>`'s
// checkout confirmation succeeds on that load (bridge-svelte sets it in its
// callback route). A Free pick sets it before navigating inside the running app.
// A reload (or a later visit) does not show it again. Whoever shows it clears it.

/** What just completed. */
export interface BridgeCheckoutResult {
  /** `checkout`: a paid Stripe checkout returned. `plan`: a plan was set without one (a Free pick). */
  kind: 'checkout' | 'plan';
  /** The plan's name, when the page that set it knew it. Otherwise read the current plan. */
  planName?: string;
}

/** A read-only, Svelte-store-shaped view of the signal (`subscribe` runs at once with the value). */
export interface BridgeCheckoutResultStore {
  subscribe(run: (value: BridgeCheckoutResult | null) => void): () => void;
  /** The current value, without subscribing. */
  get(): BridgeCheckoutResult | null;
}

let current: BridgeCheckoutResult | null = null;
const listeners = new Set<(value: BridgeCheckoutResult | null) => void>();

function set(value: BridgeCheckoutResult | null): void {
  if (value === current) return;
  current = value;
  for (const run of [...listeners]) run(current);
}

/** The checkout that just completed, or `null`. Cleared once something shows it. */
export const checkoutResult: BridgeCheckoutResultStore = Object.freeze({
  subscribe(run: (value: BridgeCheckoutResult | null) => void) {
    listeners.add(run);
    run(current);
    return () => {
      listeners.delete(run);
    };
  },
  get: () => current,
});

/** Record a completed checkout or plan pick. Called by the plugin, not by apps. */
export function markCheckoutComplete(value: BridgeCheckoutResult): void {
  set(value);
}

/** Read the result and clear it, so it is shown once. */
export function takeCheckoutResult(): BridgeCheckoutResult | null {
  const value = current;
  if (value) set(null);
  return value;
}

/** Forget the result without showing it. */
export function clearCheckoutResult(): void {
  set(null);
}
