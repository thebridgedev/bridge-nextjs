'use client';

import { FeatureFlag, useFlag } from '@nebulr-group/bridge-nextjs/client';
import '../page.css';

/**
 * Client-side Feature Flags 2.0 demo. Shows the two client primitives:
 *   - `useFlag(key, default)` — reactive hook returning `{ value, passed }`.
 *   - `<FeatureFlag flagKey defaultValue>` — declarative component.
 * Both evaluate locally against the live flag cache and re-render on live
 * updates (no page refresh).
 */
export default function FeatureFlagExample() {
  const { value, passed } = useFlag<boolean>('demo-flag', false);

  return (
    <div className="page-container">
      <div className="container">
        <div className="content">
          <div className="hero">
            <h1 className="heading-xl">Client Feature Flag Example</h1>
            <p className="text-lead">
              Reactive, client-side flag evaluation via the FF 2.0 hook and
              component.
            </p>
          </div>

          <div className="feature-examples">
            <h2 className="heading-lg">useFlag hook</h2>
            <div className="feature-example">
              <div className="card">
                <p className="note">
                  <code>const &#123; value, passed &#125; = useFlag('demo-flag', false)</code>
                </p>
                <p data-testid="use-flag-passed">passed: {String(passed)}</p>
                <p data-testid="use-flag-value">value: {String(value)}</p>
              </div>
            </div>

            <h2 className="heading-lg">&lt;FeatureFlag&gt; component</h2>
            <div className="feature-example">
              <div className="card">
                <FeatureFlag
                  flagKey="demo-flag"
                  defaultValue={false}
                  fallback={
                    <div className="feature-status" data-testid="component-off">
                      Create a feature flag called "demo-flag"
                    </div>
                  }
                >
                  {() => (
                    <div className="feature-status active" data-testid="component-on">
                      <p>Feature flag "demo-flag" is active</p>
                    </div>
                  )}
                </FeatureFlag>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
