/**
 * Singleton BridgeAuth instance + Zustand store adapter.
 *
 * This mirrors bridge-svelte's `core/bridge-instance.ts` line-for-line — it is the
 * architectural keystone of the bridge-nextjs ↔ auth-core integration. A single
 * BridgeAuth instance is created on first `initBridge()` call; its events are
 * wired to a Zustand store so React components can subscribe to live updates via
 * the matching `useXxx` hooks in `../client/hooks/`.
 *
 * The store shape and exported function names mirror bridge-svelte 1:1 so feature
 * ports translate cleanly. Reactive primitives differ (Svelte stores → Zustand)
 * but the contract is identical.
 */
import {
  BridgeAuth,
  type AppConfig,
  type AuthState,
  type Plan,
  type Profile,
  type SubscriptionStatus,
  type TenantUser,
  type TokenSet,
} from '@nebulr-group/bridge-auth-core';
import { create } from 'zustand';
import { logger } from '../shared/logger';
import { markCheckoutComplete } from '../client/checkout-result';
import type { BridgeConfig } from '../shared/types/config';

// ── Singleton ──────────────────────────────────────────────────────────────────

let _instance: BridgeAuth | null = null;
let _initConfig: BridgeConfig | null = null;

// ── Subscription state shape ──────────────────────────────────────────────────

export interface SubscriptionState {
  status: SubscriptionStatus | null;
  plans: Plan[] | null;
  loading: boolean;
  error: string | null;
}

// ── Zustand store ──────────────────────────────────────────────────────────────
//
// One store holds all reactive state pushed by auth-core events. Hooks in
// ../client/hooks/ select narrow slices via `useBridgeStore(s => s.xxx)`.

interface BridgeStoreState {
  tokens: TokenSet | null;
  appConfig: AppConfig | null;
  profile: Profile | null | undefined; // undefined = loading, null = no profile, Profile = loaded
  flags: Record<string, boolean>;
  authState: AuthState;
  isLoading: boolean;
  error: string | null;
  tenantUsers: TenantUser[];
  ready: boolean;
  subscription: SubscriptionState;
  /** `billing` slice of the app's BridgeConfig — set once by <BridgeProvider> on
   *  mount so components outside the provider's own scope (e.g. PlanSelector)
   *  can read paywallRoute / paymentErrorRoute without threading props. */
  billing: BridgeConfig['billing'] | null;
}

export const useBridgeStore = create<BridgeStoreState>(() => ({
  tokens: null,
  appConfig: null,
  profile: undefined,
  flags: {},
  authState: 'unauthenticated',
  isLoading: true,
  error: null,
  tenantUsers: [],
  ready: false,
  subscription: { status: null, plans: null, loading: false, error: null },
  billing: null,
}));

// ── Ready gate ─────────────────────────────────────────────────────────────────

let _resolveReady: (() => void) | null = null;
const _readyPromise = new Promise<void>((resolve) => {
  _resolveReady = resolve;
});

// ── App config load gate ───────────────────────────────────────────────────────
//
// The anonymous app config drives SSO button visibility, signup/magic-link
// toggles, etc. on LoginForm. We cache the in-flight fetch so concurrent
// callers share a single network request and can await the result.
let _appConfigPromise: Promise<AppConfig | null> | null = null;

// ── Init / access ──────────────────────────────────────────────────────────────

export function initBridge(config: BridgeConfig): BridgeAuth {
  if (_instance) {
    logger.debug('[bridge-instance] already initialized, returning existing');
    return _instance;
  }

  _instance = new BridgeAuth(config);
  _initConfig = config;

  // Seed store from current auth-core state
  const existingTokens = _instance.getTokens();
  if (existingTokens) {
    useBridgeStore.setState({ tokens: existingTokens });
    _instance.getProfile()
      .then((p) => useBridgeStore.setState({ profile: p ?? null }))
      .catch(() => {});
  }
  useBridgeStore.setState({
    authState: _instance.getAuthState(),
    isLoading: false,
  });

  // Wire auth-core events → Zustand store
  _instance.on('auth:login', (tokens) => {
    useBridgeStore.setState({ tokens });
    _instance!.getProfile()
      .then((p) => useBridgeStore.setState({ profile: p ?? null }))
      .catch(() => {});
  });

  _instance.on('auth:logout', () => {
    // TBP-948 — the old workspace's plans must not show to the next sign-in.
    resetSubscription();
    useBridgeStore.setState({
      tokens: null,
      profile: null,
      flags: {},
    });
  });

  _instance.on('auth:token-refreshed', (tokens) => {
    useBridgeStore.setState({ tokens });
  });

  _instance.on('auth:state-change', (state) => {
    useBridgeStore.setState({ authState: state });
    if (state === 'tenant-selection') {
      useBridgeStore.setState({ tenantUsers: _instance!.getTenantUsers() });
    } else if (state === 'authenticated' || state === 'unauthenticated') {
      useBridgeStore.setState({ tenantUsers: [] });
    }
  });

  _instance.on('auth:profile', (profile) => {
    useBridgeStore.setState({ profile });
  });

  _instance.on('auth:workspace-changed', (tokens) => {
    // TBP-948 — a read still in flight for the old workspace is dropped.
    resetSubscription();
    useBridgeStore.setState({
      tokens,
      flags: {},
    });
    _instance!.getProfile()
      .then((p) => useBridgeStore.setState({ profile: p ?? null }))
      .catch(() => {});
  });

  _instance.on('auth:error', (err) => {
    useBridgeStore.setState({ error: err.message });
  });

  // Load app config anonymously (drives SSO buttons, signup toggle, etc.).
  // Cached in `_appConfigPromise` so LoginForm (and others) can await the
  // result via `ensureAppConfig()` instead of racing the store update.
  void ensureAppConfig();

  logger.debug('[bridge-instance] initialized');
  return _instance;
}

/**
 * Load the anonymous app config into the store if it isn't already.
 *
 * Idempotent: concurrent callers share the in-flight fetch, and once the
 * store holds a value this function resolves immediately.
 *
 * Resolves with the loaded config on success or `null` on failure (the
 * fetch error is logged — it is not silently swallowed).
 */
export function ensureAppConfig(): Promise<AppConfig | null> {
  const existing = useBridgeStore.getState().appConfig;
  if (existing) return Promise.resolve(existing);
  if (_appConfigPromise) return _appConfigPromise;

  _appConfigPromise = getBridgeAuth()
    .getAppConfig()
    .then((cfg) => {
      useBridgeStore.setState({ appConfig: cfg });
      return cfg;
    })
    .catch((err) => {
      logger.warn('[bridge-instance] getAppConfig failed:', err);
      _appConfigPromise = null;
      return null;
    });

  return _appConfigPromise;
}

export function getBridgeAuth(): BridgeAuth {
  if (!_instance) {
    throw new Error(
      'BridgeAuth not initialized. Wrap your app in <BridgeProvider> first.'
    );
  }
  return _instance;
}

/**
 * Read the full plugin config passed to `initBridge()` / `<BridgeProvider>`.
 * Mirrors bridge-svelte's `getConfig()` (config.store). Throws if Bridge has
 * not been initialized yet — callers that may run before init (e.g. click
 * handlers) should guard with try/catch and fall back to a default.
 */
export function getBridgeConfig(): BridgeConfig {
  if (!_initConfig) {
    throw new Error(
      'BridgeAuth not initialized. Wrap your app in <BridgeProvider> first.'
    );
  }
  return _initConfig;
}

export function markReady(): void {
  if (useBridgeStore.getState().ready) return;
  useBridgeStore.setState({ ready: true });
  _resolveReady?.();
}

export function waitForBridge(): Promise<void> {
  return _readyPromise;
}

// ── Subscription ──────────────────────────────────────────────────────────────

// ── Stripe Checkout return (TBP-742) ────────────────────────────────────────
//
// On the return from Stripe the access token still predates the payment. The
// first `getSubscriptionStatus()` of the page confirms the checkout server-side
// and CONSUMES the session id (strips `?session_id=`, clears sessionStorage).
// The billing pages read the subscription from a child effect, which React runs
// before `<BridgeProvider>`'s paywall effect — so the child consumed the id, the
// provider saw no checkout return, trusted the pre-payment claim and sent the
// paying customer back to the plan picker. Found on stage with 0.8.0-beta.1.
//
// So the provider starts the confirmation during its own init — before any
// child mounts — and both the subscription read and the paywall check wait for
// it (bridge-react keeps the same ordering; bridge-svelte confirms in its load).

let _checkoutReturn: Promise<SubscriptionStatus | null> | null = null;

/** The pending checkout-return confirmation, if this page load returned from Stripe. */
export function pendingCheckoutReturn(): Promise<SubscriptionStatus | null> | null {
  return _checkoutReturn;
}

/** Forget the checkout return once its outcome has been acted on. */
export function clearCheckoutReturn(): void {
  _checkoutReturn = null;
}

/**
 * Start confirming a Stripe Checkout the page just returned from — once, and
 * only when a session id is pending and someone is signed in. Resolves to the
 * post-confirmation status (`null` when the read failed).
 */
export function beginCheckoutReturn(sessionId: string | null): Promise<SubscriptionStatus | null> | null {
  if (_checkoutReturn || !sessionId) return _checkoutReturn;
  const auth = getBridgeAuth();
  if (!auth.isAuthenticated()) return null;
  _checkoutReturn = auth
    .getSubscriptionStatus()
    .then((status) => {
      // TBP-946 (port of bridge-svelte TBP-813) — the page the checkout landed
      // on (the subscription page by default) says it went through, with
      // <BridgeCheckoutNotice>; there is no separate confirmation page. A
      // failed payment goes to `billing.paymentErrorRoute` instead.
      if (status && status.paymentFailed !== true) markCheckoutComplete({ kind: 'checkout' });
      return status;
    })
    .catch(() => null);
  return _checkoutReturn;
}

// TBP-948 (port of bridge-svelte TBP-762) — one refresh rule for the plan list
// and the current plan.
//
// Every screen used to fetch on its own and only when `status` was missing, so
// a list loaded once was served for the life of the tab: a plan added in Bridge
// never appeared, and the list a checkout had just changed stayed stale. Now:
//   - concurrent calls share one read, and a call made while a read is in
//     flight gets a second read after it — the caller asked because something
//     changed, and the in-flight answer may predate that;
//   - a read that fails, or answers with an empty plan list, is retried once;
//   - a background re-read never blanks what is on screen: `loading` is only
//     true while there is nothing to show, and a failed re-read keeps the last
//     good answer instead of replacing it with an error;
//   - an answer that arrives after sign-out or a workspace switch is dropped.
// `core/billing-store.ts` decides WHEN to re-read (sign-in renewal, live
// billing events, tab focus after 30 s); this function is HOW.

/** Delay before the one retry of a failed or empty read. */
let _retryDelayMs = 1000;
/** Test-only: shorten the retry delay. */
export function __setBillingRetryDelay(ms: number): void {
  _retryDelayMs = ms;
}
export function billingRetryDelay(): number {
  return _retryDelayMs;
}

let _subInflight: Promise<void> | null = null;
let _subAgain = false;
let _subLoadedAt = 0;
let _subWanted = false;
/** Bumped on sign-out and workspace switch; a read started before is discarded. */
let _subGeneration = 0;

function resetSubscription(): void {
  _subGeneration += 1;
  _subLoadedAt = 0;
  useBridgeStore.setState({ subscription: { status: null, plans: null, loading: false, error: null } });
}

/** When the plan list and status were last read successfully (ms epoch), 0 if never. */
export function subscriptionLoadedAt(): number {
  return _subLoadedAt;
}

/** True once any screen has asked for the plan list / status in this session. */
export function subscriptionWanted(): boolean {
  return _subWanted;
}

/** Re-read the plan list and the current plan. Never rejects. */
export function loadSubscription(): Promise<void> {
  _subWanted = true;
  if (_subInflight) {
    _subAgain = true;
    return _subInflight;
  }
  _subInflight = (async () => {
    try {
      do {
        _subAgain = false;
        await readSubscriptionOnce();
      } while (_subAgain);
    } finally {
      _subInflight = null;
    }
  })();
  return _subInflight;
}

/**
 * Read only when nothing has been read yet or the last read is older than
 * `maxAgeMs`. What screens call on mount instead of fetching on their own.
 */
export function ensureSubscription(maxAgeMs = 30_000): Promise<void> {
  if (_subInflight) return _subInflight;
  if (_subLoadedAt > 0 && Date.now() - _subLoadedAt < maxAgeMs) return Promise.resolve();
  return loadSubscription();
}

async function readSubscriptionOnce(): Promise<void> {
  const generation = _subGeneration;
  const current = useBridgeStore.getState().subscription;
  const hasData = current.status !== null || current.plans !== null;
  if (!hasData) {
    useBridgeStore.setState((s) => ({ subscription: { ...s.subscription, loading: true, error: null } }));
  }

  for (let attempt = 0; ; attempt++) {
    try {
      // Never read ahead of a checkout confirmation: it would consume the
      // session id, and its answer would still be the pre-payment one.
      const pending = _checkoutReturn;
      if (pending) await pending;
      const [status, plans] = await Promise.all([
        getBridgeAuth().getSubscriptionStatus(),
        getBridgeAuth().getPlans(),
      ]);
      if (generation !== _subGeneration) return;
      // An empty list is more often a read that raced a change than an app
      // with no plans: ask once more before believing it.
      if ((plans?.length ?? 0) === 0 && attempt === 0) {
        await wait(_retryDelayMs);
        if (generation !== _subGeneration) return;
        continue;
      }
      useBridgeStore.setState({ subscription: { status, plans, loading: false, error: null } });
      _subLoadedAt = Date.now();
      return;
    } catch (err) {
      if (generation !== _subGeneration) return;
      if (attempt === 0) {
        await wait(_retryDelayMs);
        if (generation !== _subGeneration) return;
        continue;
      }
      const msg = err instanceof Error ? err.message : 'Failed to load subscription';
      logger.warn('[bridge-instance] subscription read failed:', msg);
      const latest = useBridgeStore.getState().subscription;
      if (latest.status !== null || latest.plans !== null) {
        // Keep the last good answer on screen; the next trigger re-reads.
        useBridgeStore.setState((s) => ({ subscription: { ...s.subscription, loading: false } }));
      } else {
        useBridgeStore.setState((s) => ({ subscription: { ...s.subscription, loading: false, error: msg } }));
      }
      return;
    }
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Test-only: put a subscription in the store as if a read had just answered,
 * so a screen's on-mount `ensureSubscription()` does not read again.
 */
export function __seedSubscriptionForTests(subscription: SubscriptionState): void {
  useBridgeStore.setState({ subscription });
  _subLoadedAt = Date.now();
  _subWanted = true;
}

/** Test-only: forget every read and answer. */
export function __resetSubscriptionForTests(): void {
  resetSubscription();
  _subInflight = null;
  _subAgain = false;
  _subWanted = false;
}

// ── Lazy proxy accessor (matches svelte's `auth` export) ──────────────────────

/** Lazy proxy to the BridgeAuth singleton — call methods directly: `auth.getToken()`, `auth.logout()`, etc. */
export const auth: BridgeAuth = new Proxy({} as BridgeAuth, {
  get(_, prop) {
    const instance = getBridgeAuth();
    const value = (instance as any)[prop];
    return typeof value === 'function' ? value.bind(instance) : value;
  },
});

// ── Internal-only resetters (for tests) ───────────────────────────────────────

/** @internal — reset singleton + store. Used by tests only. Do not call from app code. */
export function _resetBridgeInstance(): void {
  _instance = null;
  _initConfig = null;
  _appConfigPromise = null;
  _resolveReady = null;
  _checkoutReturn = null;
  _subInflight = null;
  _subAgain = false;
  _subWanted = false;
  _subLoadedAt = 0;
  _subGeneration += 1;
  useBridgeStore.setState({
    tokens: null,
    appConfig: null,
    profile: undefined,
    flags: {},
    authState: 'unauthenticated',
    isLoading: true,
    error: null,
    tenantUsers: [],
    ready: false,
    subscription: { status: null, plans: null, loading: false, error: null },
  });
}
