'use client';

import { useEffect, useState } from 'react';

interface TimeData {
  date: string;
  time: string;
  timestamp: number;
  message: string;
}

export default function FeatureFlagAPIExample() {
  const [timeData, setTimeData] = useState<TimeData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTimeData = async () => {
      try {
        setLoading(true);
        const response = await fetch('/api/feature-flag-example');
        
        if (!response.ok) {
          // For 403 errors, show a specific message about the feature flag
          if (response.status === 403) {
            throw new Error('Feature flag "demo-flag" is not enabled');
          }
          // For other errors, show the status text
          throw new Error(`Error: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        setTimeData(data);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An unknown error occurred');
        setTimeData(null);
      } finally {
        setLoading(false);
      }
    };

    fetchTimeData();
  }, []);

  return (
    <div className="feature-example">
      <h3 className="heading-md">API Feature Flag Example</h3>
      <div className="card">
        <p className="note">API route protected by feature flag middleware</p>
        
        {loading && <p className="text-gray-500">Loading...</p>}
        
        {error && (
          <div className="feature-status">
            <p>Feature flag "demo-flag" is not enabled</p>
            <p className="mt-2 text-sm">
              This error occurs because the feature flag is not enabled. Try enabling the "demo-flag" feature flag in your bridge dashboard.
            </p>
          </div>
        )}
        
        {timeData && (
          <div>
            <div className="feature-status active">
              <p>Feature flag "demo-flag" is active</p>
            </div>
            
            <div className="mt-4">
              <h4 className="text-sm font-medium text-gray-700 mb-2">Time Information</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-gray-50 p-4 rounded-md">
                <div>
                  <p className="text-sm text-gray-600 mb-1">Date:</p>
                  <p className="font-medium">{timeData.date}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600 mb-1">Time:</p>
                  <p className="font-medium">{timeData.time}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600 mb-1">Timestamp:</p>
                  <p className="font-medium">{timeData.timestamp}</p>
                </div>
              </div>
            </div>
            
            <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded">
              <p className="text-blue-800">{timeData.message}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
} 