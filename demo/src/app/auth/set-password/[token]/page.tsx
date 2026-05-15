'use client';

import { ForgotPassword } from '@nebulr-group/bridge-nextjs/client';
import { use } from 'react';

export default function SetPasswordWithTokenPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  return (
    <div style={{ padding: '2rem', maxWidth: 480, margin: '0 auto' }}>
      <ForgotPassword
        token={token}
        onError={(err) => console.error('[SetPassword]', err)}
      />
    </div>
  );
}
