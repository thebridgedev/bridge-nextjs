import { withBridgeAuth } from '@nebulr-group/bridge-nextjs/server';

/**
 * Demo middleware — fully permissive (`defaultAccess: 'public'`).
 *
 * `withBridgeAuth` is a server-side guard that reads tokens from cookies. The
 * demo's primary flow is SDK auth, which stores tokens in `localStorage`
 * (`bridge_tokens`) — invisible to the middleware. Letting it gate routes
 * would redirect SDK-authenticated users away from their pages.
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
 * `createBridgeCallbackRoute`) should replace this with rules listing their
 * protected routes explicitly.
 */
export default withBridgeAuth({
  defaultAccess: 'public',
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
