'use client';

import {
  ProtectedRoute,
  TeamManagementPanel,
} from '@nebulr-group/bridge-nextjs/client';

/**
 * Mirrors bridge-svelte's `routes/team-panel/+page.svelte`:
 *   - Wraps the panel in client-side auth protection that redirects unauth
 *     users to `/auth/login` (svelte does this via its bootstrap route guard).
 *   - Provides a custom `tabBar` using `.my-tabs` / `.my-tab` classes to
 *     demonstrate the snippet/render-prop API.
 */
export default function TeamPanelPage() {
  return (
    <ProtectedRoute redirectTo="/auth/login">
      <div style={{ padding: '2rem' }}>
        <h1 style={{ marginBottom: '0.5rem', color: '#1f2937' }}>
          Team Management (Native SDK)
        </h1>
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
        <TeamManagementPanel
          onError={(err) => console.error('[TeamPanel]', err)}
          tabBar={({ tabs, activeTab, setTab }) => (
            <nav className="my-tabs">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  className={`my-tab${activeTab === tab.id ? ' my-tab--active' : ''}`}
                  onClick={() => setTab(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </nav>
          )}
        />
      </div>
    </ProtectedRoute>
  );
}
