'use client';

import { useEffect, useState } from 'react';

interface TimeData {
  date: string;
  time: string;
  timestamp: number;
  message: string;
}

export default function FeatureFlagExample() {
  const [timeData, setTimeData] = useState<TimeData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTimeData = async () => {
      try {
        setLoading(true);
        const response = await fetch('/api/feature-flag-example');
        
        if (!response.ok) {
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
    
    // Refresh every 5 seconds
    const interval = setInterval(fetchTimeData, 5000);
    
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="container mx-auto p-8">
      <h1 className="text-3xl font-bold mb-6">Feature Flag Example</h1>
      
      {loading && <p className="text-gray-500">Loading...</p>}
      
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          <p>{error}</p>
        </div>
      )}
      
      {timeData && (
        <div className="bg-white shadow-md rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Current Date and Time</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-gray-600">Date:</p>
              <p className="text-lg font-medium">{timeData.date}</p>
            </div>
            <div>
              <p className="text-gray-600">Time:</p>
              <p className="text-lg font-medium">{timeData.time}</p>
            </div>
            <div>
              <p className="text-gray-600">Timestamp:</p>
              <p className="text-lg font-medium">{timeData.timestamp}</p>
            </div>
            <div className="md:col-span-2">
              <p className="text-gray-600">Message:</p>
              <p className="text-lg font-medium">{timeData.message}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 