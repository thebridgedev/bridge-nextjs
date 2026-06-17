// bridge-nextjs/flags — client bootstrap for Feature Flags 2.0.
//
// Ported from bridge-svelte's `src/lib/flags/bootstrap.ts`. This module is the
// flag-specific wiring layer that sits ON TOP OF the Feature-1 core runtime
// (`core/bridge-runtime.ts`): the BridgeFlags eval cache, attribute providers,
// the telemetry batcher, hydrate, React-reactivity bumps, and the auth-token
// subscription that drives flag eval context. The realtime client, billing-store
// binding, session.snapshot fanout, and token-driven channel scoping all live in
// `core/bridge-runtime.ts` and are mounted by `<BridgeProvider>`.
//
// Translation notes (§5.1 / §5.3):
//   - svelte `tokenStore.subscribe(...)` → Zustand `useBridgeStore.subscribe(...)`
//     (the auth-token slice owned by `core/bridge-instance.ts`).
//   - All other plumbing (BridgeFlags, attribute providers, telemetry, realtime
//     re-hydrate) is framework-agnostic and behaves identically.
//   - Browser-only: `BrowserIdentityStorage` is window-guarded; the SSR import
//     path falls back to `MemoryIdentityStorage`.

import {
  BridgeFlags,
  type BridgeFlagsMode,
  type BridgeFlagsHooks,
  attachIdentity,
  type BridgeIdentity,
  type IdentityStorage,
  type AnonymousTrackingMode,
  MemoryIdentityStorage,
  TelemetryBatcher,
  type TelemetryBatcherConfig,
  AuthAttributeProvider,
  type AuthJwtClaims,
  BillingAttributeProvider,
  useBridge,
} from '@nebulr-group/bridge-auth-core';

import { setBridgeFlagsInstance, notifyFlagChanged, notifyAllFlagsChanged } from './registry';
import { getBridgeAuth, useBridgeStore } from '../core/bridge-instance';
import { _getDevAttributeProvider } from '../core/bridge';
import { getBridgeRealtime, onBridgeRealtimeOpen } from '../core/bridge-runtime';

/** A storage implementation that uses `localStorage` (persistent) or `sessionStorage` (per-tab). */
export class BrowserIdentityStorage implements IdentityStorage {
  readonly mode: AnonymousTrackingMode;
  private readonly storage: Storage;
  private readonly key: string;

  constructor(mode: 'persistent' | 'session', key = 'bridge.anon_id') {
    this.mode = mode;
    this.key = key;
    if (typeof window === 'undefined') {
      throw new Error('BrowserIdentityStorage requires a window — use MemoryIdentityStorage on the server');
    }
    this.storage = mode === 'persistent' ? window.localStorage : window.sessionStorage;
  }

  read(): string | undefined {
    try {
      return this.storage.getItem(this.key) ?? undefined;
    } catch {
      return undefined;
    }
  }

  write(id: string): void {
    try {
      this.storage.setItem(this.key, id);
    } catch {
      // Quota / privacy mode — silently degrade.
    }
  }

  clear(): void {
    try {
      this.storage.removeItem(this.key);
    } catch {
      // ignore
    }
  }
}

export interface CreateBridgeFlagsConfig {
  /**
   * Bridge API base URL. Optional — defaults to the value stored on the
   * BridgeAuth API context (which itself defaults to `https://api.thebridge.dev`).
   * Bridge developers override this for local / stage envs; product consumers
   * never set it.
   */
  apiBaseUrl?: string;
  /**
   * JWT-shaped workspace API key — sent as `x-api-key`. Optional — defaults
   * to `appId` from the BridgeAuth API context. The two values are the same
   * thing (the workspace identity) under different names; the auth config call
   * is the single source of truth.
   */
  apiKey?: string;
  /** Frontend (default) or backend. Use 'backend' in server contexts. */
  mode?: BridgeFlagsMode;
  /** Anonymous identity options. Persistent (localStorage) by default in browsers. */
  identity?: {
    /** 'persistent' (localStorage), 'session' (sessionStorage), 'none' (memory only). Default 'persistent'. */
    tracking?: AnonymousTrackingMode;
    /** Override storage entirely (e.g. cookie-backed). */
    storage?: IdentityStorage;
    /** localStorage key when using the default browser storage. Default 'bridge.anon_id'. */
    storageKey?: string;
  };
  /** Telemetry opts — set `enabled: false` to skip. */
  telemetry?: Partial<Omit<TelemetryBatcherConfig, 'apiBaseUrl' | 'apiKey'>>;
  /**
   * If false, this bootstrap won't register itself as the global instance used
   * by `useFlag` / `<FeatureFlag>`. Useful when multiple BridgeFlags are needed
   * in the same app. Defaults to true.
   */
  registerGlobal?: boolean;
  /**
   * Optional extra hooks the consumer wants chained on top of the built-in
   * (telemetry + reactivity) hooks. Errors in user hooks are caught — they will
   * never break flag eval.
   */
  hooks?: BridgeFlagsHooks;
}

export interface BridgeFlagsBundle {
  bridge: BridgeFlags;
  identity: BridgeIdentity;
  telemetry: TelemetryBatcher;
  authAttributeProvider: AuthAttributeProvider;
  billingAttributeProvider: BillingAttributeProvider;
  /** Stop telemetry + unsubscribe from auth events. Idempotent. */
  stop: () => Promise<void>;
}

function pickIdentityStorage(cfg: CreateBridgeFlagsConfig['identity']): IdentityStorage {
  if (cfg?.storage) return cfg.storage;
  const tracking = cfg?.tracking ?? 'persistent';
  if (tracking === 'none') return new MemoryIdentityStorage('none');
  // SSR path — no `window`. Fall back to memory; the browser-side bootstrap
  // (re-running with `window` present) will install the real storage.
  if (typeof window === 'undefined') {
    return new MemoryIdentityStorage(tracking);
  }
  return new BrowserIdentityStorage(tracking === 'session' ? 'session' : 'persistent', cfg?.storageKey);
}

/** Decode a JWT payload without signature verification (client-side context only). */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function resolveApiContext(): { apiBaseUrl?: string; appId?: string } {
  try {
    const ctx = getBridgeAuth().getApiContext();
    return { apiBaseUrl: ctx.apiBaseUrl, appId: ctx.appId };
  } catch {
    return {};
  }
}

/**
 * Build a fully wired BridgeFlags bundle. Bootstraps the flag-specific runtime
 * ON TOP OF the core Bridge runtime — meaning `startBridgeRuntime()` must
 * already have run (typically from `<BridgeProvider>`). The shared RealtimeClient
 * is read via `getBridgeRealtime()` and re-used; no second websocket is opened.
 *
 * The returned instance is also registered as the global instance used by
 * `useFlag` and `<FeatureFlag>` unless `registerGlobal` is explicitly false.
 */
export function createBridgeFlags(config: CreateBridgeFlagsConfig = {}): BridgeFlagsBundle {
  // Resolve config from the BridgeAuth API context when the consumer doesn't
  // pass explicit values. The auth config call is the single source of truth —
  // consumers never plumb apiBaseUrl / apiKey through twice.
  let resolvedApiBaseUrl = config.apiBaseUrl;
  let resolvedApiKey = config.apiKey;
  const ctx = resolveApiContext();
  resolvedApiBaseUrl ??= ctx.apiBaseUrl ?? 'https://api.thebridge.dev';
  resolvedApiKey ??= ctx.appId;
  if (!resolvedApiBaseUrl) resolvedApiBaseUrl = 'https://api.thebridge.dev';
  if (!resolvedApiKey) {
    throw new Error(
      'createBridgeFlags: apiKey/appId could not be resolved. Initialize <BridgeProvider> (or initBridge) first, or pass apiKey explicitly.',
    );
  }

  const bridge = new BridgeFlags({ mode: config.mode });

  // Billing 2.0 US-11 — self-report `bridge.flag_evaluations` to the usage
  // pipeline. Best-effort: in harnesses without BridgeAuth, skip.
  try {
    const auth = getBridgeAuth();
    bridge.setUsageReporter(auth.usage);
  } catch {
    // No BridgeAuth instance yet — flags can still operate without usage reporting.
  }

  // US-11 — wire the QuotaStore HTTP options so `useBridge().quota(metric)`
  // can hydrate on first access.
  try {
    const auth = getBridgeAuth();
    useBridge().quotas.configure({
      apiBaseUrl: resolvedApiBaseUrl,
      appId: auth.getApiContext().appId,
      accessToken: auth.getApiContext().accessToken,
    });
  } catch {
    // No BridgeAuth — quota hydration falls back to live pushes only.
  }

  const identity = attachIdentity(bridge, pickIdentityStorage(config.identity));

  // Phase 1 / US-13 — current decoded JWT claims. The AuthAttributeProvider's
  // `getClaims()` returns this on every flag eval so `user.role`, `user.email`,
  // `tenant.id`, `tenant.plan`, `privileges` flow through the registry.
  let _currentClaims: AuthJwtClaims | undefined;

  // Patch upsert/remove/hydrate on the bridge so realtime mutations re-notify
  // the React reactivity layer. Narrow instance-level monkey-patch — does not
  // touch auth-core itself.
  const originalUpsert = bridge.upsert.bind(bridge);
  bridge.upsert = (flag) => {
    originalUpsert(flag);
    notifyFlagChanged(flag.key, _BUMP_SENTINEL);
  };
  const originalRemove = bridge.remove.bind(bridge);
  bridge.remove = (key) => {
    originalRemove(key);
    notifyFlagChanged(key, _BUMP_SENTINEL);
  };
  const originalHydrate = bridge.hydrate.bind(bridge);
  bridge.hydrate = (flags) => {
    originalHydrate(flags);
    notifyAllFlagsChanged();
  };

  // Attach the flag cache to the SHARED RealtimeClient owned by core. Calling
  // attach() on a started client is safe. If core hasn't started yet, skip —
  // the consumer can wire it manually on `getBridgeRealtime()` once started.
  const realtime = getBridgeRealtime();
  if (realtime) {
    realtime.attach(bridge);
  }

  // Phase 1 / US-13 — bridge-managed AttributeProviders. Both auto-registered.
  const billingAttributeProvider = new BillingAttributeProvider();
  billingAttributeProvider.bindStores({
    subscription: useBridge().subscription,
    quotas: useBridge().quotas,
    entitlements: useBridge().entitlementsStore,
  });
  const authAttributeProvider = new AuthAttributeProvider({
    getClaims: () => _currentClaims,
  });
  bridge.registerAttributeProvider(authAttributeProvider);
  bridge.registerAttributeProvider(billingAttributeProvider);
  // Phase 5 — register the dev-managed provider LAST so its set/bind/bindMany
  // keys win on collision with framework providers.
  bridge.registerAttributeProvider(_getDevAttributeProvider());

  const telemetry = new TelemetryBatcher({
    apiBaseUrl: resolvedApiBaseUrl,
    apiKey: resolvedApiKey,
    ...config.telemetry,
  });

  // Compose hooks: telemetry (baseline) + reactivity (eval-driven bumps) +
  // user-supplied.
  attachWithCompositeHooks(bridge, telemetry, config.hooks ?? {});

  // Hydrate the flag cache so the first `bridge.flag()` call returns the right
  // value instead of the developer-supplied default. Best-effort.
  const hydrateFlagsCache = async (): Promise<void> => {
    try {
      const res = await fetch(
        `${resolvedApiBaseUrl!.replace(/\/+$/, '')}/admin/flags-internal/flags-cache/${encodeURIComponent(resolvedApiKey!)}`,
      );
      if (!res.ok) return;
      const flags = (await res.json()) as unknown;
      if (Array.isArray(flags) && flags.length > 0) {
        bridge.hydrate(flags as Parameters<typeof bridge.hydrate>[0]);
      }
    } catch {
      // Hydration is best-effort.
    }
  };

  // Re-hydrate every time the shared realtime client (re)opens. Covers
  // initial-hydrate-failed and flag-mutations-during-offline gaps.
  const unsubscribeOpen = onBridgeRealtimeOpen(() => {
    void hydrateFlagsCache();
  });

  // Initial hydrate fires here too — covers the case where realtime is disabled
  // and onOpen never fires.
  void hydrateFlagsCache();

  if (config.registerGlobal !== false) {
    setBridgeFlagsInstance(bridge);
  }

  // Flag-context concerns on token change: setContext identity + claims +
  // re-eval. Core handles channel scoping + quotas + reauthorize separately;
  // two subscribers is fine (idempotent and cheap).
  const applyTokenClaims = (accessToken: string | null | undefined): void => {
    if (!accessToken) {
      _currentClaims = undefined;
      bridge.setContext({ identity: undefined, attributes: {} });
      notifyAllFlagsChanged();
      return;
    }
    const claims = decodeJwtPayload(accessToken);
    if (!claims) return;
    _currentClaims = claims as AuthJwtClaims;
    bridge.setContext({
      identity: typeof claims.sub === 'string' ? claims.sub : undefined,
      attributes: {},
    });
    notifyAllFlagsChanged();
  };

  // Seed from the current token, then subscribe for changes via the Zustand
  // auth-token slice (svelte's `tokenStore.subscribe` equivalent — §5.1).
  applyTokenClaims(useBridgeStore.getState().tokens?.accessToken ?? null);
  let _prevToken = useBridgeStore.getState().tokens?.accessToken ?? null;
  const unsubscribeAuth = useBridgeStore.subscribe((state) => {
    const next = state.tokens?.accessToken ?? null;
    if (next !== _prevToken) {
      _prevToken = next;
      applyTokenClaims(next);
    }
  });

  const stop = async (): Promise<void> => {
    unsubscribeAuth();
    unsubscribeOpen();
    await telemetry.stop();
  };

  return {
    bridge,
    identity,
    telemetry,
    authAttributeProvider,
    billingAttributeProvider,
    stop,
  };
}

// ── helpers ─────────────────────────────────────────────────────────────────

const _BUMP_SENTINEL = Symbol('bridge.flags.bump');

/**
 * Reference-first, then shallow JSON, equality for flag eval values. Flag values
 * are primitives or small plain JSON objects, so this is cheap and stable.
 */
function sameFlagValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * Telemetry's `attach` calls `bridge.setHooks` and overwrites whatever was
 * there. We capture the batcher's onEval/onDiscover/onAttributeDeclaration by
 * snooping via a one-shot setHooks override, then re-install a composite that
 * calls them + our reactivity bump + the user's hooks.
 */
function attachWithCompositeHooks(
  bridge: BridgeFlags,
  telemetry: TelemetryBatcher,
  userHooks: BridgeFlagsHooks,
): void {
  let captured: BridgeFlagsHooks = {};
  const originalSetHooks = bridge.setHooks.bind(bridge);
  bridge.setHooks = (hooks: BridgeFlagsHooks): void => {
    captured = hooks ?? {};
  };
  try {
    telemetry.attach(bridge);
  } finally {
    bridge.setHooks = originalSetHooks;
  }
  // `onEval` fires on EVERY flag evaluation — including the evaluation React's
  // `useSyncExternalStore` performs inside `getSnapshot` during its
  // snapshot-consistency check (see `flags/use-flag.ts`). Notifying the change
  // bus unconditionally from there makes that read impure: the notification
  // re-enters React's check, which re-reads `getSnapshot`, which evaluates again,
  // which fires `onEval` again — an unbounded synchronous loop that freezes the
  // renderer. (Svelte's `$derived` doesn't re-read synchronously, so the svelte
  // port doesn't hit this.) Dedupe by last-notified value per flag so the bump
  // fires only on a genuine value TRANSITION: the consistency re-read then sees
  // an unchanged value, doesn't notify, and converges. Real cache mutations stay
  // covered by the upsert/remove/hydrate patches and the context-change notifies.
  const _lastEvalValue = new Map<string, unknown>();
  bridge.setHooks({
    onEval: (ev) => {
      try { captured.onEval?.(ev); } catch { /* telemetry hook errors swallowed */ }
      try { userHooks.onEval?.(ev); } catch { /* user hook errors swallowed */ }
      const had = _lastEvalValue.has(ev.flag);
      const prev = _lastEvalValue.get(ev.flag);
      if (!had || !sameFlagValue(prev, ev.value)) {
        _lastEvalValue.set(ev.flag, ev.value);
        notifyFlagChanged(ev.flag, ev.value);
      }
    },
    onDiscover: (ev) => {
      try { captured.onDiscover?.(ev); } catch { /* ignore */ }
      try { userHooks.onDiscover?.(ev); } catch { /* ignore */ }
    },
    onAttributeDeclaration: (decl) => {
      try { captured.onAttributeDeclaration?.(decl); } catch { /* ignore */ }
      try { userHooks.onAttributeDeclaration?.(decl); } catch { /* ignore */ }
    },
    onAttributeObserved: (obs) => {
      try { captured.onAttributeObserved?.(obs); } catch { /* ignore */ }
      try { userHooks.onAttributeObserved?.(obs); } catch { /* ignore */ }
    },
  });
}
