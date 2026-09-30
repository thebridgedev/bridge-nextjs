/**
 * TBP-742 (port of bridge-svelte TBP-697/703) — `bridgeFetch(url, init)` and the
 * page-wide 402 observer.
 */
import { getBridgeAuth, getBridgeConfig } from './bridge-instance';
import { observeQuotaRefusal, watchesQuotaOrigin } from './quota-refusal';

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (typeof URL !== 'undefined' && input instanceof URL) return input.href;
  return (input as Request).url;
}

function pageHref(): string | undefined {
  const href = (globalThis as { location?: { href?: unknown } }).location?.href;
  return typeof href === 'string' ? href : undefined;
}

/** `url` made absolute against the page, so a relative `/api/x` has an origin. */
function absoluteUrl(url: string): string {
  try {
    return new URL(url, pageHref()).href;
  } catch {
    return url;
  }
}

/**
 * `fetch` for calls to **your own backend** that carry the signed-in user's
 * Bridge access token.
 *
 *   'use client';
 *   import { bridgeFetch } from '@nebulr-group/bridge-nextjs/client';
 *   const res = await bridgeFetch('/api/projects', { method: 'POST', body });
 *
 * Adds `Authorization: Bearer <access token>` (when signed in), and on a `401`
 * refreshes the token once and retries — so an expired token mid-session is
 * not an error the page has to handle. Same signature as `fetch`.
 *
 * A `402 { code: 'QUOTA_EXCEEDED', … }` answer (what bridge-nestjs's
 * `@RequireQuota` sends at the plan's cap) opens the upgrade dialog
 * `<BridgeProvider>` mounts, whatever origin your backend is on. The response
 * is still returned to you unchanged.
 *
 * It sends the user's token to whatever URL you give it, so call it for your
 * backend only — never for a third-party URL.
 */
export async function bridgeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const response = await fetchWithToken(input, init);
  void observeQuotaRefusal(response, absoluteUrl(requestUrl(input)));
  return response;
}

async function fetchWithToken(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  let auth: ReturnType<typeof getBridgeAuth>;
  try {
    auth = getBridgeAuth();
  } catch {
    // Bridge not initialised (a server render, a test) — behave exactly like fetch.
    return fetch(input, init);
  }

  const withToken = (token: string | undefined): RequestInit => {
    const headers = new Headers(
      init?.headers ?? (typeof Request !== 'undefined' && input instanceof Request ? input.headers : undefined),
    );
    if (token) headers.set('Authorization', `Bearer ${token}`);
    return { ...init, headers };
  };

  const sentToken = auth.getTokens()?.accessToken;
  const response = await fetch(input, withToken(sentToken));
  if (response.status !== 401 || !sentToken) return response;

  // A streamed body is gone after the first attempt; it cannot be replayed.
  const replayable =
    !(typeof Request !== 'undefined' && input instanceof Request) &&
    !(typeof ReadableStream !== 'undefined' && init?.body instanceof ReadableStream);
  if (!replayable) return response;

  const fresh = await auth.refreshTokens().catch(() => null);
  const freshToken = fresh?.accessToken ?? auth.getTokens()?.accessToken;
  if (!freshToken || freshToken === sentToken) return response;
  return fetch(input, withToken(freshToken));
}

/**
 * Install the page-wide 402 observer on `window.fetch`: a plain `fetch` to the
 * page's own origin, to Bridge's API or to a `billing.apiOrigins` origin that
 * answers `402 QUOTA_EXCEEDED` opens the upgrade dialog too. It only LOOKS at
 * the response (a clone, after the fact) — the request and the response the
 * caller gets are untouched. Idempotent; returns the uninstall function.
 *
 * `<BridgeProvider>` installs it; apps never call this.
 */
let _installed: { restore: () => void } | null = null;
export function installQuotaRefusalObserver(): () => void {
  if (_installed) return _installed.restore;
  const win = typeof window !== 'undefined' ? window : null;
  if (!win || typeof win.fetch !== 'function') return () => {};

  const original = win.fetch;
  const observed = async function bridgeObservedFetch(input: RequestInfo | URL, init?: RequestInit) {
    const response = await original.call(win, input, init);
    if (response.status === 402) {
      try {
        const url = requestUrl(input);
        let apiBaseUrl: string | undefined;
        let apiOrigins: readonly string[] | undefined;
        try {
          const config = getBridgeConfig();
          apiBaseUrl = config.apiBaseUrl ?? 'https://api.thebridge.dev';
          apiOrigins = config.billing?.apiOrigins;
        } catch {
          /* not initialised — the page origin still counts */
        }
        const href = pageHref();
        const pageOrigin = href ? new URL(href).origin : undefined;
        if (watchesQuotaOrigin(url, { pageOrigin, apiBaseUrl, apiOrigins })) {
          void observeQuotaRefusal(response, absoluteUrl(url));
        }
      } catch {
        /* never let the observer break a fetch */
      }
    }
    return response;
  } as typeof fetch;

  win.fetch = observed;
  const restore = () => {
    if (win.fetch === observed) win.fetch = original;
    _installed = null;
  };
  _installed = { restore };
  return restore;
}
