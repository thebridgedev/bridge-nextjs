import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { logger } from '../../shared/logger';
import type { BridgeConfig } from '../../shared/types/config';

/**
 * Server-side verification of the Bridge session token (TBP-666).
 *
 * The middleware used to accept any `bridge_access_token` cookie whose `exp`
 * was in the future: the token was only DECODED, never verified, so a
 * hand-written `header.{"exp":9999999999}.x` passed every protected route.
 * This is the one place the server now decides "is this a Bridge session".
 *
 * What is checked — mirrors bridge-nestjs's verifier (auth-core
 * `JwksService`, which nestjs wraps with the same issuer/audience):
 *   - signature against the Bridge JWKS at `<authBaseUrl>/.well-known/jwks.json`
 *     (served by bridge-api `well-known.controller.ts`);
 *   - algorithm pinned to PS256, the only algorithm bridge-api signs access
 *     tokens with (`jwt-util.ts` ACCESS_TOKEN_SIGN_OPTIONS) — `alg: none`, HS*
 *     and RS* are rejected;
 *   - `iss` === `authBaseUrl` (`<apiBaseUrl>/auth` unless overridden);
 *   - `aud` contains the configured `appId`;
 *   - `exp` / `nbf` (jose's defaults, no clock tolerance).
 *
 * Any failure — bad signature, wrong claim, unreachable JWKS, missing config —
 * returns `null`: the caller treats that as "no session" (fail closed).
 *
 * Edge-runtime safe: `jose` uses Web Crypto and `fetch`, no Node APIs. The
 * remote key set is cached per process (per Edge isolate) and re-created
 * hourly; jose itself refetches on an unknown `kid` (key rotation).
 */

/** The only algorithm Bridge signs user access tokens with. */
export const BRIDGE_SESSION_TOKEN_ALGORITHMS = ['PS256'];

const JWKS_TTL_MS = 60 * 60 * 1000;

type RemoteJwks = ReturnType<typeof createRemoteJWKSet>;
const jwksByUrl = new Map<string, { jwks: RemoteJwks; createdAt: number }>();

export interface SessionVerificationSettings {
  /** Expected `iss`. */
  issuer: string;
  /** Expected `aud` (the app id). */
  audience: string;
  /** Where the public keys are fetched from. */
  jwksUrl: string;
}

/** Derive what a valid session token must look like from the SDK config. */
export function sessionVerificationSettings(
  config: Partial<BridgeConfig> | null | undefined,
): SessionVerificationSettings | null {
  const apiBaseUrl = config?.apiBaseUrl?.replace(/\/+$/, '');
  const authBaseUrl = (config?.authBaseUrl ?? (apiBaseUrl ? `${apiBaseUrl}/auth` : undefined))?.replace(/\/+$/, '');
  const appId = config?.appId;
  if (!authBaseUrl || !appId) return null;
  return {
    issuer: authBaseUrl,
    audience: appId,
    jwksUrl: `${authBaseUrl}/.well-known/jwks.json`,
  };
}

function remoteJwks(url: string): RemoteJwks {
  const cached = jwksByUrl.get(url);
  if (cached && Date.now() - cached.createdAt < JWKS_TTL_MS) return cached.jwks;
  const jwks = createRemoteJWKSet(new URL(url));
  jwksByUrl.set(url, { jwks, createdAt: Date.now() });
  return jwks;
}

/**
 * Verify a Bridge session (access) token. Returns its claims, or `null` when
 * the token is not a valid, current Bridge token for this app.
 */
export async function verifySessionToken(
  token: string | null | undefined,
  config: Partial<BridgeConfig> | null | undefined,
): Promise<JWTPayload | null> {
  if (!token) return null;
  const settings = sessionVerificationSettings(config);
  if (!settings) {
    logger.error('[bridge] session verification is not configured (appId / apiBaseUrl missing); denying');
    return null;
  }
  try {
    const { payload } = await jwtVerify(token, remoteJwks(settings.jwksUrl), {
      issuer: settings.issuer,
      audience: settings.audience,
      algorithms: BRIDGE_SESSION_TOKEN_ALGORITHMS,
    });
    return payload;
  } catch (err) {
    logger.debug('[bridge] session token rejected:', err instanceof Error ? err.message : err);
    return null;
  }
}

/** Test-only: forget cached key sets. */
export function __resetSessionVerificationForTests(): void {
  jwksByUrl.clear();
}
