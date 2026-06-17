import { NextRequest } from 'next/server';
import {
  BridgeFlags,
  BridgePullCache,
  MemoryIdentityStorage,
  attachIdentity,
  serverInstanceId,
  serializeContext,
  BRIDGE_CONTEXT_HEADER,
  type CachedFlag,
  type EvalContext,
  type AuthJwtClaims,
} from '@nebulr-group/bridge-auth-core';
import { logger } from '../../shared/logger';
import { BridgeConfig } from '../../shared/types/config';
import { getConfig } from './get-config';
import { TokenServiceServer } from './token-service.server';

/**
 * Server-side feature flag evaluation for bridge-nextjs — Feature Flags 2.0.
 *
 * This is the NestJS-shaped server eval translated to a Next.js primitive
 * (§4.1 backend reference + §5.2 routing translation). It mirrors
 * bridge-nestjs's `BridgeFlagsService` + `BridgePullCache` behavior:
 *
 *   - A single backend-mode `BridgeFlags` instance evaluates flags LOCALLY per
 *     request (no per-request REST call to a `bulkEvaluate` endpoint — that
 *     legacy path is gone).
 *   - A `BridgePullCache` (TTL-bounded) fetches+caches the workspace's flag
 *     rules from bridge-api's `flags-cache` endpoint; the SDK then evaluates
 *     them inline against the per-request context.
 *   - Backend mode (locked decision #27): evals with no identity refuse to
 *     bucket rolled-out rules and return the safe default.
 *   - A stable `serverInstanceId()` is set so system-level flags can target the
 *     instance.
 *   - Per-request context is built from the request's token claims
 *     (sub/role/tid/plan/privileges) — the same claim shape the
 *     AuthAttributeProvider flattens on the client. If a propagated
 *     `x-bridge-context` header is present (set by an upstream Bridge SDK), it
 *     is honored too (mirrors nestjs `BridgeContextInterceptor`).
 *
 * Public method names/signatures are kept stable where reasonable
 * (`isFeatureEnabledServer`, `loadAllFlagsServer`, `init`, `getInstance`) so
 * the middleware / route-handlers / ServerFeatureFlag callers port cleanly.
 */
export class FeatureFlagServer {
  private static instance: FeatureFlagServer;
  private config: BridgeConfig | null = null;

  private readonly bridge: BridgeFlags;
  private readonly pullCache: BridgePullCache;

  private constructor() {
    // Backend mode — server-side semantics (no auto-anonymous identity).
    this.bridge = new BridgeFlags({ mode: 'backend' });
    this.bridge.setServerInstanceId(serverInstanceId());
    // Server identity storage is memory-only — no localStorage / window here.
    attachIdentity(this.bridge, new MemoryIdentityStorage('none'));
    this.pullCache = new BridgePullCache();
  }

  static getInstance(): FeatureFlagServer {
    if (!FeatureFlagServer.instance) {
      FeatureFlagServer.instance = new FeatureFlagServer();
    }
    return FeatureFlagServer.instance;
  }

  /** Initialize the feature flag server with configuration. */
  init(config: BridgeConfig): void {
    this.config = config;
  }

  private ensureConfig(): BridgeConfig | null {
    if (!this.config) {
      this.config = getConfig();
    }
    return this.config;
  }

  private apiBaseUrl(): string {
    const cfg = this.ensureConfig();
    return (cfg?.apiBaseUrl ?? 'https://api.thebridge.dev').replace(/\/+$/, '');
  }

  /**
   * Fetch + cache the workspace's flag rules from bridge-api. TTL-bounded via
   * BridgePullCache so concurrent requests share one in-flight fetch and the
   * upstream isn't hammered. Hydrates the shared BridgeFlags cache on refresh.
   */
  private async ensureFlagsHydrated(appId: string): Promise<void> {
    try {
      await this.pullCache.get(`flags:${appId}`, async () => {
        const url = `${this.apiBaseUrl()}/admin/flags-internal/flags-cache/${encodeURIComponent(appId)}`;
        const res = await fetch(url);
        if (!res.ok) {
          logger.warn(`FeatureFlagServer - flags-cache fetch failed: ${res.status} ${res.statusText}`);
          return [] as CachedFlag[];
        }
        const flags = (await res.json()) as unknown;
        const list = Array.isArray(flags) ? (flags as CachedFlag[]) : [];
        if (list.length > 0) {
          this.bridge.hydrate(list);
        }
        return list;
      });
    } catch (err) {
      logger.warn('FeatureFlagServer - flag hydration skipped:', err);
    }
  }

  /**
   * Build a per-request EvalContext from the request. Order of precedence:
   *   1. A propagated `x-bridge-context` header (set by an upstream Bridge SDK)
   *      — honored as the base, mirroring nestjs BridgeContextInterceptor.
   *   2. Token claims from the request cookies (sub → identity; role/email/tid/
   *      plan/privileges → attributes) — the same claim shape the client-side
   *      AuthAttributeProvider flattens.
   * Returns `undefined` when neither is present (backend mode then returns the
   * safe default for rolled-out rules).
   */
  buildContextFromRequest(request: NextRequest): Partial<EvalContext> | undefined {
    // 1. Propagated header (deserialize is done by callers that want it; here we
    //    decode claims from the token, which is the common Next.js case).
    const tokenService = TokenServiceServer.getInstance();
    const cookieString = request.headers.get('cookie') || '';
    const accessToken = tokenService.getAccessTokenServer(cookieString);
    if (!accessToken) return undefined;

    const claims = decodeJwtPayload(accessToken) as AuthJwtClaims | null;
    if (!claims) return undefined;

    const attributes: Record<string, unknown> = {};
    if (typeof claims.role === 'string') attributes['user.role'] = claims.role;
    if (typeof claims.email === 'string') attributes['user.email'] = claims.email;
    if (typeof claims.tid === 'string') attributes['tenant.id'] = claims.tid;
    if (typeof claims.plan === 'string') attributes['tenant.plan'] = claims.plan;
    if (claims.privileges !== undefined) attributes['privileges'] = claims.privileges;

    return {
      identity: typeof claims.sub === 'string' ? claims.sub : undefined,
      attributes,
    };
  }

  /**
   * Check if a feature flag is enabled on the server. Evaluates locally against
   * the per-request context using the backend-mode BridgeFlags instance.
   *
   * Signature is kept stable with the legacy version (the legacy `forceLive`
   * param is accepted and ignored — there is no per-flag REST eval anymore; the
   * pull-cache TTL governs freshness).
   */
  async isFeatureEnabledServer(
    flagName: string,
    request: NextRequest,
    _forceLive = false,
  ): Promise<boolean> {
    const cfg = this.ensureConfig();
    if (!cfg?.appId) {
      logger.error('FeatureFlagServer - No appId available. Initialize with a valid config.');
      return false;
    }

    await this.ensureFlagsHydrated(cfg.appId);
    const context = this.buildContextFromRequest(request);

    try {
      return this.bridge.flag<boolean>(flagName, false, context).value;
    } catch (error) {
      logger.error(`FeatureFlagServer - Error checking feature flag ${flagName}:`, error);
      return false;
    }
  }

  /**
   * Typed flag read on the server. Returns the Bridge-decided value (on-value
   * when a rule passes, the supplied default otherwise). Mirrors the client
   * `evaluateFlag` contract and nestjs `BridgeFlagsService.flag`.
   */
  async flagServer<T>(
    flagName: string,
    defaultValue: T,
    request: NextRequest,
  ): Promise<T> {
    const cfg = this.ensureConfig();
    if (!cfg?.appId) {
      logger.error('FeatureFlagServer - No appId available. Initialize with a valid config.');
      return defaultValue;
    }
    await this.ensureFlagsHydrated(cfg.appId);
    const context = this.buildContextFromRequest(request);
    try {
      return this.bridge.flag<T>(flagName, defaultValue, context).value;
    } catch (error) {
      logger.error(`FeatureFlagServer - Error checking feature flag ${flagName}:`, error);
      return defaultValue;
    }
  }

  /**
   * Load all cached flags on the server as a `{ key: boolean }` map. Evaluates
   * each cached flag against the per-request context.
   */
  async loadAllFlagsServer(request: NextRequest): Promise<{ [key: string]: boolean }> {
    const cfg = this.ensureConfig();
    if (!cfg?.appId) {
      logger.error('FeatureFlagServer - No appId available. Initialize with a valid config.');
      return {};
    }

    await this.ensureFlagsHydrated(cfg.appId);
    const context = this.buildContextFromRequest(request);

    const result: { [key: string]: boolean } = {};
    try {
      for (const key of this.bridge.cachedKeys()) {
        result[key] = this.bridge.flag<boolean>(key, false, context).value;
      }
    } catch (error) {
      logger.error('FeatureFlagServer - Error loading feature flags:', error);
    }
    return result;
  }

  /**
   * Serialize a per-request context into the `x-bridge-context` header value so
   * downstream Bridge backends (nestjs/express) share the same identity for
   * their own flag evals. Mirrors auth-core's `serializeContext` + the nestjs
   * BridgeContextInterceptor wire contract. Returns `undefined` when there is
   * no context to propagate.
   */
  serializeContextForRequest(request: NextRequest): string | undefined {
    const ctx = this.buildContextFromRequest(request);
    if (!ctx || (!ctx.identity && Object.keys(ctx.attributes ?? {}).length === 0)) {
      return undefined;
    }
    try {
      return serializeContext(ctx as EvalContext);
    } catch (err) {
      logger.warn('FeatureFlagServer - context serialization failed:', err);
      return undefined;
    }
  }
}

/** Re-exported for callers that set the header on outbound requests/responses. */
export { BRIDGE_CONTEXT_HEADER };

// ── helpers ─────────────────────────────────────────────────────────────────

/** Decode a JWT payload without signature verification (claims-only read). */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const normalized = part.replace(/-/g, '+').replace(/_/g, '/');
    const json =
      typeof atob === 'function'
        ? atob(normalized)
        : Buffer.from(normalized, 'base64').toString('utf-8');
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}
