import { withAuth, withFeatureFlags } from 'nblocks-nextjs/server';
import { NextRequest } from 'next/server';

// Define feature flag protections
const featureFlagProtections = [
  {
    flag: 'demo-flag',
    paths: [
      '/api/feature-flag-example',
      '/premium/dashboard'
    ],
    redirectTo: '/feature-not-enabled'
  },
  {
    flag: 'beta-feature',
    paths: [
      '/beta/*',
      '/experimental/*'
    ],
    redirectTo: '/beta-signup'
  }
];

// Create the feature flag middleware
const featureFlagMiddleware = withFeatureFlags(featureFlagProtections);

// Create the auth middleware
const authMiddleware = withAuth({
  // Public paths that don't require authentication
  publicPaths: ['/', '/login', '/auth/oauth-callback'],
});

// Export the middleware function
export async function middleware(request: NextRequest) {
  // Apply feature flag middleware first
  const featureFlagResponse = await featureFlagMiddleware(request);
  if (featureFlagResponse.status !== 200) {
    return featureFlagResponse;
  }
  
  // Let the auth middleware handle all path protection logic
  return authMiddleware(request);
}

// Configure which paths the middleware should run on
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ]
}; 