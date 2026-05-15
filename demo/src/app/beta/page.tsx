'use client';

import { FeatureFlag } from '@nebulr-group/bridge-nextjs/client';

export default function BetaPage() {
  return (
    <div style={{ padding: '2rem' }}>
      <h1>Beta features</h1>
      <p>This page is gated by the <code>beta</code> feature flag.</p>
      <FeatureFlag
        flagName="beta"
        fallback={
          <div className="feature-status">
            The <code>beta</code> flag is off for your user. Toggle it in the
            Bridge admin UI to see beta content here.
          </div>
        }
      >
        <div className="feature-status active">
          <p>You have beta access. 🎉</p>
        </div>
      </FeatureFlag>
    </div>
  );
}
