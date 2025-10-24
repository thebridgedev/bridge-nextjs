
// Interface for single flag evaluation response
interface FlagEvaluation {
  enabled: boolean;
}

// Interface for a single flag in the bulk response
interface FlagResponse {
  flag: string;
  evaluation: FlagEvaluation;
}

// Interface for the bulk flags response
interface BulkFeatureFlagResponse {
  flags: FlagResponse[];
}

// Interface for a single flag response - the individual evaluation format is simpler
interface SingleFlagResponse {
  enabled: boolean;
}

const baseUrl = 'https://backendless.bridge.cloud';
const cacheValidityMs = 5 * 60 * 1000; // 5 minutes
let cachedFlags: { [key: string]: boolean } = {};
let lastFetchTime = 0;

/**
 * Get the currently cached flags
 * @returns Object with flag names as keys and boolean values
 */
export const getCachedFlags = (): { [key: string]: boolean } => {
  return { ...cachedFlags };
};

export const loadFeatureFlags = async (appId: string, accessToken: string): Promise<void> => {
  const url = `${baseUrl}/flags/bulkEvaluate/${appId}`;
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ accessToken }),
    });

    if (!response.ok) {
      console.error(`Failed to load feature flags: ${response.status} ${response.statusText}`);
      throw new Error('Failed to load feature flags');
    }

    const data: BulkFeatureFlagResponse = await response.json();
    
    cachedFlags = data.flags.reduce((acc, flag) => {
      acc[flag.flag] = flag.evaluation?.enabled ?? false;
      return acc;
    }, {} as { [key: string]: boolean });
    
    lastFetchTime = Date.now();
  } catch (error) {
    console.error('Error loading feature flags:', error);
    throw error;
  }
};

export const isFeatureEnabled = async (flagName: string, appId: string, accessToken: string, forceLive: boolean = false): Promise<boolean> => {
  const isCacheValid = Date.now() - lastFetchTime < cacheValidityMs;

  if (!isCacheValid) {
    await loadFeatureFlags(appId, accessToken);
  }

  if (forceLive) {
    const url = `${baseUrl}/flags/evaluate/${appId}/${flagName}`;
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ accessToken }),
      });

      if (!response.ok) {
        console.error(`Failed to check feature flag ${flagName}: ${response.status} ${response.statusText}`);
        return cachedFlags[flagName] ?? false;
      }

      const data: SingleFlagResponse = await response.json();
      
      // For individual evaluation, the enabled property is directly on the response object
      const enabled = data.enabled ?? false;
      cachedFlags[flagName] = enabled;
      
      return enabled;
    } catch (error) {
      console.error(`Error checking feature flag ${flagName}:`, error);
      return cachedFlags[flagName] ?? false;
    }
  }

  return cachedFlags[flagName] ?? false;
}; 