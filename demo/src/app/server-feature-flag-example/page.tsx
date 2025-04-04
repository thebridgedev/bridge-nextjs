import { ServerFeatureFlag } from 'nblocks-nextjs/server';
import { Suspense } from 'react';
import '../page.css';

// Wrapper component to handle the async ServerFeatureFlag
function ServerFeatureFlagWrapper() {
  return (
    <Suspense fallback={<div className="text-gray-500">Loading feature flag status...</div>}>
      <ServerFeatureFlag 
        flagName="demo-flag"
        forceLive={true}
        fallback={
          <div className="feature-status">
            <p>Create a feature flag called "demo-flag"</p>
          </div>
        }
      >
        <div className="feature-status active">
          <p>Feature flag "demo-flag" is active</p>
        </div>
      </ServerFeatureFlag>
    </Suspense>
  );
}

export default function ServerFeatureFlagExamplePage() {
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
                <ServerFeatureFlagWrapper />
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
              <p className="font-bold text-yellow-800">Important Note About Caching</p>
              <p className="text-yellow-800">
                Server-side feature flags use server-side caching (typically 5 minutes). When you enable or disable a flag,
                you may see a delay before the server-side content updates. For faster updates, consider using the 
                <code className="ml-1 mr-1">forceLive</code> option in your middleware configuration.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 