'use client';

import { MagicLink } from '@nebulr-group/bridge-nextjs/client';

export default function MagicLinkPage() {
  return (
    <div style={{ padding: '2rem', maxWidth: 480, margin: '0 auto' }}>
      <MagicLink onError={(err) => console.error('[MagicLink]', err)} />
    </div>
  );
}
