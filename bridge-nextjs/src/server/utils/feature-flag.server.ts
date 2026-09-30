import { NextRequest } from 'next/server';
import {
  BridgeFlags,
  BridgePullCache,
  MemoryIdentityStorage,
  attachIdentity,
  claimsToAttributes,
  flattenBillingSnapshot,
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
import { verifySessionToken } from './verify-session';

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
 *   - Per-request context is built from the VERIFIED session token's claims
 *     with auth-core's `claimsToAttributes` — the one mapping the browser's
 *     AuthAttributeProvider uses (`user.id`, `user.role`, `user.email`,
 *     `tenant.id`, `tenant.plan`, `privileges`) — so a rule means the same
 *     thing on both sides (TBP-757). Flag evaluations add the workspace's
 *     `bridge:billing.*` attributes (plan, subscription status, trial,
 *     entitlements) read from Bridge's `/session/init`, cached per workspace,
 *     like bridge-nestjs. An inbound `x-bridge-context` header is never read —
 *     it is internal, and a client can send anything in it (TBP-671).
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
  /** TBP-757 — the newest verified `plan` claim seen per workspace. */
  private readonly billingPlanClaim = new Map<string, { plan: string | undefined; iat: number | undefined }>();
  private billingWarned = false;

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
   * @deprecated The claims are DECODED, not verified — anyone can write a
   * cookie that claims `plan: 'enterprise'`. Never use this for an access
   * decision; the SDK's own flag checks use `buildVerifiedContextFromRequest`
   * (TBP-666). Kept for display-only callers.
   */
  buildContextFromRequest(request: NextRequest): Partial<EvalContext> | undefined {
    const tokenService = TokenServiceServer.getInstance();
    const cookieString = request.headers.get('cookie') || '';
    const accessToken = tokenService.getAccessTokenServer(cookieString);
    if (!accessToken) return undefined;
    return contextFromClaims(decodeJwtPayload(accessToken) as AuthJwtClaims | null);
  }

  /**
   * The per-request eval context from VERIFIED token claims (signature,
   * PS256, issuer, audience = appId, exp — see `verify-session.ts`). A token
   * that fails verification yields no context, so identity- and plan-targeted
   * rules fall back to the safe default (TBP-666: a forged cookie claiming
   * `plan: 'pro'` used to unlock plan-gated flags).
   */
  async buildVerifiedContextFromRequest(request: NextRequest): Promise<Partial<EvalContext> | undefined> {
    return (await this.verifiedSession(request))?.context;
  }

  private async verifiedSession(
    request: NextRequest,
  ): Promise<{ context: Partial<EvalContext>; accessToken: string; claims: AuthJwtClaims } | undefined> {
    const tokenService = TokenServiceServer.getInstance();
    const cookieString = request.headers.get('cookie') || '';
    const accessToken = tokenService.getAccessTokenServer(cookieString);
    if (!accessToken) return undefined;
    const claims = (await verifySessionToken(accessToken, this.ensureConfig())) as AuthJwtClaims | null;
    const context = contextFromClaims(claims);
    if (!context || !claims) return undefined;
    return { context, accessToken, claims };
  }

  /**
   * TBP-757 — the context flag evaluations use: the verified claims plus the
   * workspace's `bridge:billing.*` attributes, so a rule on the plan, the
   * subscription status or an entitlement answers on the server as it does in
   * the browser. The billing half is read from Bridge (`/session/init`, with
   * the verified token), never from the request, and degrades to the claims
   * alone when Bridge cannot be reached.
   */
  private async evalContextFromRequest(request: NextRequest): Promise<Partial<EvalContext> | undefined> {
    const session = await this.verifiedSession(request);
    if (!session) return undefined;
    try {
      const billing = await this.billingAttributesFor(session.accessToken, session.claims);
      return { ...session.context, attributes: { ...session.context.attributes, ...billing } };
    } catch (err) {
      if (!this.billingWarned) {
        this.billingWarned = true;
        logger.warn(
          "FeatureFlagServer - could not read the workspace's plan and entitlements from Bridge; flag rules on bridge:billing.* see no value until it answers.",
          err,
        );
      }
      return session.context;
    }
  }

  /**
   * `bridge:billing.*` for the verified token's workspace, cached per
   * workspace by the pull cache (30 s TTL) and dropped as soon as a newer
   * verified token carries a different `plan` claim, so a plan change reaches
   * the server without waiting for the TTL. `bridge:billing.quota.*` is not
   * included: `/session/init` does not carry quotas.
   */
  private billingAttributesFor(accessToken: string, claims: AuthJwtClaims): Promise<Record<string, unknown>> {
    const tid = typeof claims.tid === 'string' && claims.tid.length > 0 ? claims.tid : undefined;
    const appId = this.ensureConfig()?.appId;
    if (!tid || !appId) return Promise.resolve({});
    this.notePlanClaim(tid, claims);
    return this.pullCache.get(`billing:${tid}`, async () => {
      const res = await fetch(`${this.apiBaseUrl()}/session/init`, {
        headers: { Authorization: `Bearer ${accessToken}`, 'x-app-id': appId },
      });
      if (!res.ok) throw new Error(`GET /session/init failed: ${res.status}`);
      const snap = (await res.json()) as {
        tenant?: { subscription?: unknown; entitlements?: Record<string, unknown> | null };
      } | null;
      return flattenBillingSnapshot({
        subscription: snap?.tenant?.subscription as { plan?: { slug?: unknown } | null; status?: unknown } | null,
        entitlements: snap?.tenant?.entitlements,
      });
    });
  }

  /*
   * A newer verified token whose `plan` claim differs from the one the cached
   * billing attributes were read under means the plan changed: drop them. An
   * older token never invalidates (two users on tokens of different vintages
   * would otherwise evict each other on every request).
   */
  private notePlanClaim(tid: string, claims: AuthJwtClaims): void {
    const raw = (claims as { plan?: unknown }).plan;
    const plan = typeof raw === 'string' ? raw : undefined;
    const iatRaw = (claims as { iat?: unknown }).iat;
    const iat = typeof iatRaw === 'number' ? iatRaw : undefined;
    const seen = this.billingPlanClaim.get(tid);
    if (!seen) {
      this.billingPlanClaim.set(tid, { plan, iat });
      return;
    }
    const newer = seen.iat === undefined || iat === undefined || iat >= seen.iat;
    if (!newer) return;
    if (seen.plan !== plan) this.pullCache.invalidate(`billing:${tid}`);
    this.billingPlanClaim.set(tid, { plan, iat });
  }

  /** @deprecated Serializes UNVERIFIED claims; use `serializeVerifiedContextForRequest`. */
  serializeContextForRequest(request: NextRequest): string | undefined {
    return serializeForHeader(this.buildContextFromRequest(request));
  }

  /**
   * Serialize the verified per-request context into the `x-bridge-context`
   * header value so downstream Bridge backends (nestjs/express) share the same
   * identity for their own flag evals. Mirrors auth-core's `serializeContext` +
   * the nestjs BridgeContextInterceptor wire contract. `undefined` when there is
   * no verified context to propagate.
   */
  async serializeVerifiedContextForRequest(request: NextRequest): Promise<string | undefined> {
    return serializeForHeader(await this.buildVerifiedContextFromRequest(request));
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
    const context = await this.evalContextFromRequest(request);

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
    const context = await this.evalContextFromRequest(request);
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
    const context = await this.evalContextFromRequest(request);

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

}

/** Re-exported for callers that set the header on outbound requests/responses. */
export { BRIDGE_CONTEXT_HEADER };

// ── helpers ─────────────────────────────────────────────────────────────────

/**
 * Map Bridge token claims to the flag eval context with auth-core's
 * `claimsToAttributes` — the mapping the browser's AuthAttributeProvider uses,
 * so `user.id`, `user.role`, `privileges` and the rest mean the same on both
 * sides (TBP-757).
 */
function contextFromClaims(claims: AuthJwtClaims | null | undefined): Partial<EvalContext> | undefined {
  if (!claims) return undefined;
  return {
    identity: typeof claims.sub === 'string' ? claims.sub : undefined,
    attributes: claimsToAttributes(claims),
  };
}

function serializeForHeader(ctx: Partial<EvalContext> | undefined): string | undefined {
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
