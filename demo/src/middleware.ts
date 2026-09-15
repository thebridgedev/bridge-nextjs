import { withBridgeAuth } from '@nebulr-group/bridge-nextjs/server';

/**
 * Demo middleware — fully permissive (`defaultAccess: 'public'`).
 *
 * Which layer guards what: `withBridgeAuth` guards hosted-login sessions, which
 * live in cookies. The demo's primary flow is SDK auth, which stores tokens in
 * `localStorage` (`bridge_tokens`), invisible to the middleware; for SDK-auth
 * apps (`loginRoute` set) the middleware steps aside and `<ProtectedRoute>` plus
 * the API are the guards. Neither route guard replaces verifying the token in
 * the API.
 *
 * Note: `match: '/:path*'` would NOT work here — `withBridgeAuth`'s matcher
 * uses exact/prefix string equality (no path-parameter parsing). Use
 * `defaultAccess: 'public'` to make every route public.
 *
 * Mirrors bridge-svelte's demo, which has no equivalent server middleware:
 * route gating is done client-side by the SDK components (TeamManagementPanel,
 * PlanSelector, etc. bail out gracefully when the user isn't authenticated).
 *
 * Consuming apps that use the hosted-redirect flow (cookies set by
 * `createBridgeCallbackRoute`) should list their protected routes: either
 * `defaultAccess: 'protected'` with public exceptions, or `{ match, public: false }`
 * rules under `defaultAccess: 'public'`. Both are enforced for cookie sessions.
 */
export default withBridgeAuth({
  defaultAccess: 'public',
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
