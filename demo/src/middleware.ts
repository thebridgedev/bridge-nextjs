import { withBridgeAuth } from '@nebulr-group/bridge-nextjs/server';

export default withBridgeAuth({
  rules: [
    { match: '/', public: true },
    // Auth pages must be reachable before sign-in
    { match: '/auth/login', public: true },
    { match: '/auth/signup', public: true },
    { match: '/auth/forgot-password', public: true },
    { match: '/auth/magic-link', public: true },
    { match: '/auth/set-password', public: true },
    { match: '/auth/set-password/:token*', public: true },
    { match: '/auth/setup-passkey', public: true },
    { match: '/auth/setup-passkey/:token*', public: true },
    { match: '/auth/oauth-callback', public: true },
    // Server-side flag demos can render without an authenticated user
    { match: '/feature-flag-example', public: true },
    { match: '/server-feature-flag-example', public: true },
    { match: '/api/feature-flag-example', public: true },
    // Everything else (/team-panel, /protected, /subscription/*, /workspaces, /beta) is protected.
  ],
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
