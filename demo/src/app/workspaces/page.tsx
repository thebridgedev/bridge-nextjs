'use client';

import { WorkspaceSelector } from '@nebulr-group/bridge-nextjs/client';

export default function WorkspacesPage() {
  return (
    <div style={{ padding: '2rem' }}>
      <h1>Workspaces</h1>
      <p>Switch between workspaces you have access to.</p>
      <WorkspaceSelector
        onSwitch={() => {
          // Full reload so all hooks reset to the new workspace's context.
          window.location.reload();
        }}
        onError={(err) => console.error('[Workspaces]', err)}
      />
    </div>
  );
}
