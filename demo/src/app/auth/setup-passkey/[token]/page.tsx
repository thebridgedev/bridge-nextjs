'use client';

import { PasskeySetup } from '@nebulr-group/bridge-nextjs/client';
import { use } from 'react';

export default function SetupPasskeyWithTokenPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  return (
    <div style={{ padding: '2rem', maxWidth: 480, margin: '0 auto' }}>
      <PasskeySetup
        token={token}
        onError={(err) => console.error('[PasskeySetup]', err)}
      />
    </div>
  );
}
