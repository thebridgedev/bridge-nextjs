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
  type BridgeAuthConfig,
  type Plan,
  type Profile,
  type SubscriptionStatus,
  type TenantUser,
  type TokenSet,
} from '@nebulr-group/bridge-auth-core';
import { create } from 'zustand';
import { logger } from '../shared/logger';
import type { BridgeConfig } from '../shared/types/config';

// ── Singleton ──────────────────────────────────────────────────────────────────

let _instance: BridgeAuth | null = null;

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

export function initBridge(config: BridgeAuthConfig): BridgeAuth {
  if (_instance) {
    logger.debug('[bridge-instance] already initialized, returning existing');
    return _instance;
  }

  _instance = new BridgeAuth(config);

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
    useBridgeStore.setState({
      tokens,
      flags: {},
      subscription: { status: null, plans: null, loading: false, error: null },
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

export function markReady(): void {
  if (useBridgeStore.getState().ready) return;
  useBridgeStore.setState({ ready: true });
  _resolveReady?.();
}

export function waitForBridge(): Promise<void> {
  return _readyPromise;
}

// ── Subscription ──────────────────────────────────────────────────────────────

export async function loadSubscription(): Promise<void> {
  useBridgeStore.setState((s) => ({
    subscription: { ...s.subscription, loading: true, error: null },
  }));
  try {
    const [status, plans] = await Promise.all([
      getBridgeAuth().getSubscriptionStatus(),
      getBridgeAuth().getPlans(),
    ]);
    useBridgeStore.setState({
      subscription: { status, plans, loading: false, error: null },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to load subscription';
    useBridgeStore.setState((s) => ({
      subscription: { ...s.subscription, loading: false, error: msg },
    }));
  }
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
  _appConfigPromise = null;
  _resolveReady = null;
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
