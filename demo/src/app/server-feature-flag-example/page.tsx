import { ServerFeatureFlag } from '@nebulr-group/bridge-nextjs/server';
import '../page.css';

export default async function ServerFeatureFlagExamplePage() {
  return (
    <div className="page-container">      
      <div className="container">
        <div className="content">
          <div className="hero">
            <h1 className="heading-xl">Server-Side Feature Flag Example</h1>
            <p className="text-lead">
              This example demonstrates how to use ServerFeatureFlag to conditionally render content on the server.
            </p>
          </div>
          
          <div className="feature-examples">
            <h2 className="heading-lg">Server-Side Feature Flag</h2>
            
            <div className="feature-example">
              <div className="card">
                <p className="note">Rendered on the server at build time or request time</p>
                <ServerFeatureFlag
                  flagName="demo-flag"
                  fallback={
                    <div className="feature-status" data-testid="server-flag-off">
                      <p>Create a feature flag called "demo-flag"</p>
                    </div>
                  }
                >
                  <div className="feature-status active" data-testid="server-flag-on">
                    <p>Feature flag "demo-flag" is active</p>
                  </div>
                </ServerFeatureFlag>
              </div>
            </div>
            
            <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded">
              <p className="text-blue-800">
                Server-side feature flags are evaluated on the server before the page is sent to the client.
                This means the content is either included or excluded from the initial HTML, improving performance
                and preventing content flashing.
              </p>
            </div>
            
            <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded">
              <p className="font-bold text-yellow-800">Note About Caching</p>
              <p className="text-yellow-800">
                FF 2.0 server evaluation reads flag rules from a short-lived
                pull cache (default 30s TTL) and evaluates them locally per
                request against the user&apos;s token claims. When you toggle a
                flag you may see up to one TTL window of delay before the
                server-rendered content updates.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 