import { createBridgeCallbackRoute } from '@nebulr-group/bridge-nextjs/server';

export const GET = createBridgeCallbackRoute({
  redirectPath: '/',
  errorRedirectPath: '/?error=auth_failed'
}); 