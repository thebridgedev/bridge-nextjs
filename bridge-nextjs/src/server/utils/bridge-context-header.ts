import { NextRequest, NextResponse } from 'next/server';
import { BRIDGE_CONTEXT_HEADER } from '@nebulr-group/bridge-auth-core';

/**
 * `x-bridge-context` is INTERNAL (TBP-671).
 *
 * It carries the flag eval context (identity, plan, role, …) from this app to
 * downstream Bridge backends. The SDK builds it itself, from the VERIFIED
 * session token only (`verify-session.ts`). A copy sent by a client is never
 * trusted: it is deleted on every path that forwards the request, so a browser
 * cannot claim `tenant.plan: enterprise` or another user's `sub` and have this
 * app pass that on to a backend that buckets or authorizes on it. No SDK code
 * reads an inbound copy either.
 *
 * `Headers` names are case-insensitive, so `delete` removes every spelling.
 */

/** The request headers minus any client-supplied context, plus the verified one when given. */
export function trustedRequestHeaders(request: Request, verifiedContext?: string): Headers {
  const headers = new Headers(request.headers);
  headers.delete(BRIDGE_CONTEXT_HEADER);
  if (verifiedContext) headers.set(BRIDGE_CONTEXT_HEADER, verifiedContext);
  return headers;
}

/**
 * `NextResponse.next()` that never forwards a client-supplied context. Plain
 * `NextResponse.next()` forwards the incoming request headers untouched.
 */
export function nextWithTrustedContext(request: Request, verifiedContext?: string): NextResponse {
  return NextResponse.next({ request: { headers: trustedRequestHeaders(request, verifiedContext) } });
}

/** The request as an app handler should see it: same URL/method/body, trusted context only. */
export function withTrustedContext(request: NextRequest, verifiedContext?: string): NextRequest {
  return new NextRequest(request, {
    headers: trustedRequestHeaders(request, verifiedContext),
    duplex: 'half',
  } as ConstructorParameters<typeof NextRequest>[1]);
}
