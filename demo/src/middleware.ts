import { withNblocksAuth } from '@nebulr-group/nblocks-nextjs/server';

// Export the middleware function using the new simplified approach
export default withNblocksAuth({
  rules: [
    { match: '/', public: true },
    { match: '/login', public: true },
    { match: '/auth/oauth-callback', public: true },
    // All other routes are protected by default
  ]
});

// Configure which paths the middleware should run on
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ]
}; 