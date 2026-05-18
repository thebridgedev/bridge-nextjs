'use client';

import { ForgotPassword } from '@nebulr-group/bridge-nextjs/client';

export default function ForgotPasswordPage() {
  return (
    <div style={{ padding: '2rem', maxWidth: 480, margin: '0 auto' }}>
      <ForgotPassword onError={(err) => console.error('[ForgotPassword]', err)} />
    </div>
  );
}
