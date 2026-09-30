import { BridgeAuthRoutes } from '@nebulr-group/bridge-nextjs/client';

// Every sign-in page: login, signup, oauth-callback, set-password/[token],
// forgot-password, magic-link, setup-passkey/[token], workspaces.
export default function AuthPage() {
  return <BridgeAuthRoutes />;
}
