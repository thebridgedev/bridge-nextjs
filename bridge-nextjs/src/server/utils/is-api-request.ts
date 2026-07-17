import { NextRequest } from 'next/server';

/**
 * Determine whether a request is an API/data request (as opposed to a browser
 * page navigation).
 *
 * Used to pick the right denial semantics: API requests get a JSON status
 * response (401/403/402), whereas page navigations may be redirected (e.g. to
 * the login page for unauthenticated users).
 *
 * Heuristics (any match ⇒ API request):
 *   - the path is under `/api/`
 *   - the `accept` header prefers `application/json` and does NOT ask for HTML
 *     (a browser navigation typically sends `Accept: text/html,...`)
 *   - the request declares a JSON `content-type`
 *   - it is an explicit fetch/XHR (`sec-fetch-mode: cors`/`same-origin` without
 *     a document destination, or the legacy `x-requested-with` header)
 */
export function isApiRequest(request: NextRequest): boolean {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith('/api/')) {
    return true;
  }

  const accept = request.headers.get('accept') || '';
  // A real browser page navigation asks for text/html first. If the client
  // asks for JSON and not HTML, treat it as an API/data request.
  if (accept.includes('application/json') && !accept.includes('text/html')) {
    return true;
  }

  const contentType = request.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return true;
  }

  // Legacy AJAX marker.
  if ((request.headers.get('x-requested-with') || '').toLowerCase() === 'xmlhttprequest') {
    return true;
  }

  // Fetch metadata: a document navigation has `sec-fetch-dest: document`.
  // A non-document fetch (empty/cors) is a data request.
  const fetchDest = request.headers.get('sec-fetch-dest');
  if (fetchDest && fetchDest !== 'document' && fetchDest !== '') {
    return true;
  }

  return false;
}
