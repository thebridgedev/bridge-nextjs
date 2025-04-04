import { createNblocksCallbackRoute } from 'nblocks-nextjs/server';

export const GET = createNblocksCallbackRoute({
  redirectPath: '/',
  errorRedirectPath: '/?error=auth_failed'
}); 