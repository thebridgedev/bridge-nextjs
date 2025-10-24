'use client';

import { FeatureFlag, useNblocksConfig } from '@nebulr-group/nblocks-nextjs/client';
import Link from 'next/link';
import { Component, ReactNode } from 'react';
import FeatureFlagAPIExample from '../components/FeatureFlagAPIExample';
import './page.css';

// Simple Hello component to demonstrate feature flags
function HelloComponent() {
  return (
    <div className="feature-status active">
      <p>Feature flag "demo-flag" is active</p>
    </div>
  );
}

// Error boundary component to catch errors from useNblocksConfig
class ConfigErrorBoundary extends Component<
  { children: ReactNode; fallback: (error: Error) => ReactNode },
  { error: Error | null }
> {
  constructor(props: { children: ReactNode; fallback: (error: Error) => ReactNode }) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return this.props.fallback(this.state.error);
    }

    return this.props.children;
  }
}

// Component that uses the hook
function ConfigDisplay() {
  const config = useNblocksConfig();
  
  return (
    <div className="feature-status active">
      <p className="font-bold">Success</p>
      <p>nBlocks configuration initialized with appId: {config.appId}</p>
    </div>
  );
}

// Error display component
function ConfigError({ error }: { error: Error }) {
  return (
    <div className="feature-status">
      <p className="font-bold">Error</p>
      <p>{error.message}</p>
      <p className="mt-2 text-sm">
        {error.message.includes('appId is required') ? (
          <>
            Please set the <code>NEXT_PUBLIC_NBLOCKS_APP_ID</code> environment variable or provide an appId in the NblocksConfigProvider.
          </>
        ) : (
          <>
            Make sure the NblocksConfigProvider is properly initialized in your app.
          </>
        )}
      </p>
    </div>
  );
}

export default function Home() {
  return (
    <div className="page-container">      
      <div className="container">
        <div className="content">
          <div className="hero">
            <h1 className="heading-xl">Welcome to the nBlocks Next.js Demo</h1>
            <p className="text-lead">
              This demo showcases the integration of nBlocks features in a Next.js application.
            </p>
          </div>

          <ConfigErrorBoundary
            fallback={(error) => <ConfigError error={error} />}
          >
            <ConfigDisplay />
          </ConfigErrorBoundary>
          
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
                  <li>Team members overview</li>
                  <li>Role management</li>
                  <li>Invite system</li>
                  <li>Permissions handling</li>
                </ul>
              </div>

              <div className="feature-group">
                <h3 className="heading-md">🔐 Authentication</h3>
                <ul>
                  <li>Login & logout flow</li>
                  <li>Protected routes</li>
                  <li>Automatic token renewal</li>
                  <li>Profile information</li>
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
                <h3 className="heading-md">Cached Feature Flag</h3>
                <div className="card">
                  <p className="note">Uses cached values (5-minute cache)</p>
                  <FeatureFlag 
                    flagName="demo-flag"
                    fallback={<div className="feature-status">Create a feature flag called "demo-flag"</div>}
                  >
                    <div className="feature-status active">
                      <p>Feature flag "demo-flag" is active</p>
                    </div>
                  </FeatureFlag>
                </div>
              </div>
              
              <div className="feature-example">
                <h3 className="heading-md">Live Feature Flag</h3>
                <div className="card">
                  <p className="note">Direct API call on each load</p>
                  <FeatureFlag 
                    flagName="demo-flag"
                    forceLive={true}
                    fallback={<div className="feature-status">Create a feature flag called "demo-flag"</div>}
                  >
                    <div className="feature-status active">
                      <p>Feature flag "demo-flag" is active</p>
                    </div>
                  </FeatureFlag>
                </div>
              </div>
            </div>
            
            <div className="feature-examples-grid">
              <div className="feature-example">
                <h3 className="heading-md">Client-Side API Feature Flag</h3>
                <div className="card">
                  <FeatureFlagAPIExample />
                </div>
              </div>
              
              <div className="feature-example">
                <h3 className="heading-md">Server-Side Feature Flag</h3>
                <div className="card">
                  <p className="mb-4">
                    Server-side feature flags are rendered on the server and cannot be directly embedded in client components.
                    Click the link below to see the server-side feature flag example:
                  </p>
                  <Link 
                    href="/server-feature-flag-example" 
                    className="nav-link"
                  >
                    View Server-Side Feature Flag Example
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
