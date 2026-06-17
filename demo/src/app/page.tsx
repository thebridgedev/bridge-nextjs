'use client';

import { FeatureFlag } from '@nebulr-group/bridge-nextjs/client';
import Link from 'next/link';
import { ConfigStatus } from '../components/ConfigStatus';
import { BridgeSurfaceStatus } from '../components/BridgeSurfaceStatus';
import './page.css';

/**
 * Mirrors bridge-svelte's `routes/+page.svelte`. The Svelte source includes a
 * commented-out FeatureFlagAPIExample block and a commented-out link to the
 * server-side flag demo — we preserve those as live links here since the
 * nextjs demo is the only place those nextjs-specific endpoints exist.
 */
export default function Home() {
  return (
    <div className="page-container">
      <div className="container">
        <div className="content">
          <div className="hero">
            <h1 className="heading-xl">Welcome to the bridge Next.js Demo</h1>
            <p className="text-lead">
              This demo showcases the integration of Bridge features in a Next.js application.
            </p>
          </div>

          <ConfigStatus />

          <BridgeSurfaceStatus />

          <div className="features-overview">
            <h2 className="heading-lg">The code demonstrates the following features</h2>
            <div className="features-grid">
              <div className="feature-group">
                <h3 className="heading-md">🚦 Feature Flags</h3>
                <ul>
                  <li>Basic feature flag usage</li>
                  <li>Negation support for inverse conditions</li>
                  <li>Cached vs live flag checks</li>
                  <li>Route protection with flags</li>
                </ul>
              </div>

              <div className="feature-group">
                <h3 className="heading-md">👥 Team Management</h3>
                <ul>
                  <li><Link href="/team-panel">Team Panel (Native SDK)</Link></li>
                  <li>Role management</li>
                  <li>Invite system</li>
                  <li>Permissions handling</li>
                </ul>
              </div>

              <div className="feature-group">
                <h3 className="heading-md">🔐 Authentication (OAuth Redirect)</h3>
                <ul>
                  <li>Login & logout via hosted page</li>
                  <li>Protected routes</li>
                  <li>Automatic token renewal</li>
                  <li>Profile information</li>
                </ul>
              </div>

              <div className="feature-group">
                <h3 className="heading-md">🔑 Authentication (SDK Auth)</h3>
                <ul>
                  <li><Link href="/auth/login">Login</Link> — email, password, MFA, tenant</li>
                  <li><Link href="/auth/signup">Signup</Link> — registration form</li>
                  <li><Link href="/auth/forgot-password">Forgot Password</Link> — reset link</li>
                  <li><Link href="/auth/magic-link">Magic Link</Link> — passwordless</li>
                </ul>
              </div>

              <div className="feature-group">
                <h3 className="heading-md">💳 Subscriptions</h3>
                <ul>
                  <li><Link href="/subscription">Plan Selector</Link> — pick/change plan</li>
                  <li>Free plan activation (no Stripe)</li>
                  <li>Stripe Checkout for paid plans</li>
                  <li>Billing portal redirect</li>
                </ul>
              </div>

              <div className="feature-group">
                <h3 className="heading-md">🛠️ Integration Examples</h3>
                <ul>
                  <li>Conditional rendering</li>
                  <li>Route guards</li>
                  <li>State management</li>
                  <li>Error handling</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="feature-examples">
            <h2 className="heading-lg">Feature Flag Examples</h2>

            <div className="feature-examples-grid">
              <div className="feature-example">
                <h3 className="heading-md">Simple on/off flag</h3>
                <div className="card">
                  <p className="note">
                    Live — toggling <code>demo-flag</code> in the admin UI updates
                    this box instantly (no refresh).
                  </p>
                  {/* FF 2.0: `flagKey` + `defaultValue`, children + fallback.
                      React reserves `key`, so the flag key is passed as `flagKey`. */}
                  <FeatureFlag flagKey="demo-flag" defaultValue={false}>
                    {() => (
                      <div className="feature-status active" data-testid="demo-flag-on">
                        <p>Feature flag "demo-flag" is active</p>
                      </div>
                    )}
                  </FeatureFlag>
                </div>
              </div>

              <div className="feature-example">
                <h3 className="heading-md">Flag with fallback</h3>
                <div className="card">
                  <p className="note">
                    The <code>fallback</code> renders when the flag is off / no
                    rule matched.
                  </p>
                  <FeatureFlag
                    flagKey="demo-flag"
                    defaultValue={false}
                    fallback={
                      <div className="feature-status" data-testid="demo-flag-off">
                        Create a feature flag called "demo-flag"
                      </div>
                    }
                  >
                    {() => (
                      <div className="feature-status active">
                        <p>Feature flag "demo-flag" is active</p>
                      </div>
                    )}
                  </FeatureFlag>
                </div>
              </div>
            </div>

            {/*
              The two cards below are NEXT.JS-SPECIFIC demos (no bridge-svelte
              equivalent). svelte's home page comments these out; we leave them
              live because the server-side flag and API-route-with-middleware
              patterns only exist in Next.
            */}
            <div className="feature-examples-grid">
              <div className="feature-example">
                <h3 className="heading-md">Client Feature Flag (hook + component)</h3>
                <div className="card">
                  <p className="note">
                    The <Link href="/feature-flag-example">/feature-flag-example</Link>{' '}
                    page demonstrates the FF 2.0 <code>useFlag</code> hook and{' '}
                    <code>&lt;FeatureFlag&gt;</code> component.
                  </p>
                </div>
              </div>

              <div className="feature-example">
                <h3 className="heading-md">Server-Side Feature Flag</h3>
                <div className="card">
                  <p className="note">
                    See the Next.js-only <Link href="/server-feature-flag-example">/server-feature-flag-example</Link>{' '}
                    for the SSR-evaluated flag pattern.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
