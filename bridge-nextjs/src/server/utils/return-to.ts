/**
 * Server-side deep-link preservation for Next.js (TBP-629).
 *
 * The browser packages stash the return target in `sessionStorage`. Next.js
 * cannot: `withAuth` runs in middleware and `createBridgeCallbackRoute` is a
 * route handler, so neither end of the hosted-login round-trip has a DOM. A
 * cookie is the only storage both halves can see.
 *
 * It is sound here for the same reason sessionStorage is sound in the browser
 * packages, and for no more general reason than that: the whole round-trip
 * happens in one tab and returns to the origin that wrote the value. Visitor
 * opens the deep link, middleware writes the cookie and redirects to the hosted
 * portal, they sign in, the portal returns them to our callback on our origin —
 * where the cookie is still attached.
 *
 * Properties chosen deliberately:
 *
 * - `httpOnly` — nothing in the browser needs to read it, so nothing should be
 *   able to.
 * - `sameSite: 'lax'` — 'strict' would drop the cookie on the top-level GET
 *   navigation back from the identity provider, which is the ONE request it
 *   exists to survive.
 * - a short `maxAge` — this is in-flight state for a login that is happening
 *   now. A stale value would hijack a later login in the same browser, sending
 *   somebody to a page they asked for an hour ago.
 * - `secure` off localhost — a dev server on plain http would otherwise never
 *   receive it back, and the failure would look like the feature not working.
 */
import type { NextRequest, NextResponse } from 'next/server';
import { RETURN_TO_STORAGE_KEY, sanitizeReturnTo } from '@nebulr-group/bridge-auth-core';

/** Cookie name. Deliberately the same string the browser packages use for their
 *  sessionStorage key, so one grep finds every place this value lives. */
export const RETURN_TO_COOKIE = RETURN_TO_STORAGE_KEY;

/** Ten minutes. Long enough for a slow sign-in, short enough that a forgotten
 *  value cannot surprise the next one. */
const RETURN_TO_MAX_AGE_SECONDS = 600;

/**
 * Write the return target onto a response, if there is a safe one to write.
 *
 * No-ops on null/unsafe input, so callers never have to branch.
 */
export function stashReturnToCookie(
  response: NextResponse,
  value: string | null | undefined,
  requestUrl: string,
): void {
  const safe = sanitizeReturnTo(value);
  if (!safe) return;

  let secure = true;
  try {
    secure = new URL(requestUrl).protocol === 'https:';
  } catch {
    // Unparseable URL — keep the safer default.
  }

  response.cookies.set(RETURN_TO_COOKIE, safe, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: RETURN_TO_MAX_AGE_SECONDS,
  });
}

/**
 * Read the stashed return target off a request, re-sanitized.
 *
 * Re-sanitizing is belt-and-braces — the value was sanitized on the way in and
 * is same-origin — but it is the difference between "a cookie was tampered
 * with" being a routing oddity and being an open redirect.
 */
export function readReturnToCookie(request: NextRequest): string | null {
  return sanitizeReturnTo(request.cookies.get(RETURN_TO_COOKIE)?.value ?? null);
}

/**
 * Clear the cookie on a response. One-shot by design: a value left behind would
 * hijack the next login in this browser.
 */
export function clearReturnToCookie(response: NextResponse): void {
  response.cookies.set(RETURN_TO_COOKIE, '', { path: '/', maxAge: 0 });
}
