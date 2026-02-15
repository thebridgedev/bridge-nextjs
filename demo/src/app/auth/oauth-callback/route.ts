import { createBridgeCallbackRoute } from '@nebulr-group/bridge-nextjs/server';


// Use Node.js runtime so server-side fetch to stage auth works (Edge sandbox can fail for external URLs)
export const runtime = 'nodejs';

export const GET = createBridgeCallbackRoute({
  redirectPath: '/',
  errorRedirectPath: '/?error=auth_failed'
}); 