'use client';

import { TeamManagementPanel } from '@nebulr-group/bridge-nextjs/client';

export default function TeamPanelPage() {
  return (
    <div style={{ padding: '2rem' }}>
      <h1 style={{ marginBottom: '0.5rem', color: '#1f2937' }}>Team Management (Native SDK)</h1>
      <p
        style={{
          marginBottom: '2rem',
          color: '#6b7280',
          fontSize: '0.875rem',
        }}
      >
        This uses the native <code>TeamManagementPanel</code> component — no
        iframe, direct GraphQL.
      </p>
      <TeamManagementPanel onError={(err) => console.error('[TeamPanel]', err)} />
    </div>
  );
}
