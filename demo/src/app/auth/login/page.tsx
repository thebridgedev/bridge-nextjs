'use client';

import { LoginForm } from '@nebulr-group/bridge-nextjs/client';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  return (
    <div style={{ padding: '2rem', maxWidth: 480, margin: '0 auto' }}>
      <LoginForm
        heading="Sign in"
        onLogin={() => router.push('/')}
        onError={(err) => console.error('[Login]', err)}
      />
    </div>
  );
}
