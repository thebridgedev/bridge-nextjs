'use client';

import { useCallback, useEffect, useState } from 'react';
import { Profile, ProfileService } from '../../shared/services/profile.service';
import { useNblocksConfig } from './use-nblocks-config';
import { useNblocksToken } from './use-nblocks-token';

/**
 * Hook for profile functionality
 * 
 * @returns Profile data and functions
 * 
 * @example
 * import { useProfile } from 'nblocks-nextjs';
 * 
 * function MyComponent() {
 *   const { 
 *     profile, 
 *     isLoading, 
 *     error,
 *     updateProfile
 *   } = useProfile();
 *   
 *   if (isLoading) return <div>Loading...</div>;
 *   if (error) return <div>Error: {error}</div>;
 *   
 *   return (
 *     <div>
 *       <h1>Welcome, {profile?.name}</h1>
 *       <p>Email: {profile?.email}</p>
 *     </div>
 *   );
 * }
 */
export function useProfile() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  
  const config = useNblocksConfig();
  const { isAuthenticated } = useNblocksToken();
  
  // Initialize profile service
  useEffect(() => {
    const profileService = ProfileService.getInstance();
    profileService.init(config);
  }, [config]);
  
  // Update profile when authentication state changes
  useEffect(() => {
    const fetchProfile = async () => {
      if (!isAuthenticated) {
        setProfile(null);
        setIsLoading(false);
        return;
      }
      
      setIsLoading(true);
      setError(null);
      
      try {
        const profileService = ProfileService.getInstance();
        await profileService.updateProfile();
        const currentProfile = profileService.getCurrentProfile();
        setProfile(currentProfile);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to fetch profile';
        setError(errorMessage);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchProfile();
  }, [isAuthenticated]);
  
  // Update profile function
  const updateProfile = useCallback(async (): Promise<Profile | null> => {
    setIsLoading(true);
    setError(null);
    
    try {
      const profileService = ProfileService.getInstance();
      await profileService.updateProfile();
      const currentProfile = profileService.getCurrentProfile();
      setProfile(currentProfile);
      return currentProfile;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update profile';
      setError(errorMessage);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);
  
  // Utility functions
  const isOnboarded = useCallback((): boolean => {
    return profile?.onboarded || false;
  }, [profile]);
  
  const hasMultiTenantAccess = useCallback((): boolean => {
    return profile?.multiTenantAccess || false;
  }, [profile]);
  
  return {
    profile,
    isLoading,
    error,
    updateProfile,
    isOnboarded,
    hasMultiTenantAccess
  };
} 