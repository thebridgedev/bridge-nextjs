'use client';

import { SignupForm } from '@nebulr-group/bridge-nextjs/client';
import { useRouter } from 'next/navigation';

export default function SignupPage() {
  const router = useRouter();
  return (
    <div style={{ padding: '2rem', maxWidth: 480, margin: '0 auto' }}>
      <SignupForm
        onSignup={() => router.push('/auth/login')}
        onError={(err) => console.error('[Signup]', err)}
      />
    </div>
  );
}
