'use client';

import { useCallback, useEffect, useState } from 'react';
import { TeamManagementService } from '../../shared/services/team-management.service';
import { TokenService } from '../../shared/services/token.service';
import { useNblocksConfig } from './use-nblocks-config';
import { useNblocksToken } from './use-nblocks-token';

/**
 * Hook for accessing nBlocks team management functionality
 * 
 * @returns Team management functions and state
 * 
 * @example
 * import { useTeamManagement } from 'nblocks-nextjs';
 * 
 * function MyComponent() {
 *   const { 
 *     teamManagementUrl, 
 *     isLoading, 
 *     error, 
 *     launchTeamManagement 
 *   } = useTeamManagement();
 *   
 *   return (
 *     <div>
 *       {isLoading ? (
 *         <p>Loading...</p>
 *       ) : error ? (
 *         <p>Error: {error}</p>
 *       ) : (
 *         <button onClick={launchTeamManagement}>
 *           Open Team Management
 *         </button>
 *       )}
 *     </div>
 *   );
 * }
 */
export const useTeamManagement = () => {
  const [teamManagementUrl, setTeamManagementUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasToken, setHasToken] = useState(false);
  
  const config = useNblocksConfig();
  const { isAuthenticated } = useNblocksToken();
  
  // Initialize team management service
  useEffect(() => {
    const teamManagementService = TeamManagementService.getInstance();
    const tokenService = TokenService.getInstance();
    teamManagementService.init(config, tokenService);
  }, [config]);
  
  // Check if token is available
  useEffect(() => {
    if (isAuthenticated) {
      const teamManagementService = TeamManagementService.getInstance();
      setHasToken(teamManagementService.hasToken());
    } else {
      setHasToken(false);
    }
  }, [isAuthenticated]);
  
  // Get team management URL
  const getTeamManagementUrl = useCallback(async (): Promise<string> => {
    // Don't attempt to fetch if not authenticated
    if (!isAuthenticated) {
      setError('User must be authenticated to access team management');
      throw new Error('User must be authenticated to access team management');
    }

    // Check if token is available
    if (!hasToken) {
      console.log('No token available, checking again...');
      const teamManagementService = TeamManagementService.getInstance();
      
      if (!teamManagementService.hasToken()) {
        setError('No access token available for team management');
        throw new Error('No access token available for team management');
      }
      
      setHasToken(true);
    }

    setIsLoading(true);
    setError(null);
    
    try {
      const teamManagementService = TeamManagementService.getInstance();
      const url = await teamManagementService.getTeamManagementUrl();
      
      setTeamManagementUrl(url);
      return url;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to get team management URL';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated, hasToken]);
  
  // Launch team management UI
  const launchTeamManagement = useCallback(async (): Promise<void> => {
    // Don't attempt to launch if not authenticated
    if (!isAuthenticated) {
      setError('User must be authenticated to access team management');
      throw new Error('User must be authenticated to access team management');
    }

    // Check if token is available
    if (!hasToken) {
      console.log('No token available, checking again...');
      const teamManagementService = TeamManagementService.getInstance();
      
      if (!teamManagementService.hasToken()) {
        setError('No access token available for team management');
        throw new Error('No access token available for team management');
      }
      
      setHasToken(true);
    }

    setIsLoading(true);
    setError(null);
    
    try {
      const teamManagementService = TeamManagementService.getInstance();
      await teamManagementService.launchTeamManagement();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to launch team management';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated, hasToken]);
  
  return {
    teamManagementUrl,
    isLoading,
    error,
    hasToken,
    getTeamManagementUrl,
    launchTeamManagement
  };
}; 