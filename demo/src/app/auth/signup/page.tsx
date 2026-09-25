'use client';

import { SignupForm } from '@nebulr-group/bridge-nextjs/client';

export default function SignupPage() {
  // Stay on the page after a successful signup: <SignupForm> renders its own
  // "Check your email" confirmation, which is the next step the user needs and
  // what the E2E specs assert. Navigating to /auth/login from `onSignup` hid it
  // behind a login form the new user has no password for yet (TBP-721; mirrors
  // the bridge-svelte demo, which only logs here).
  return (
    <div style={{ padding: '2rem', maxWidth: 480, margin: '0 auto' }}>
      <SignupForm
        onSignup={() => console.log('[Signup] Account created — check your email')}
        onError={(err) => console.error('[Signup]', err)}
      />
    </div>
  );
}
