'use client';

import { useCallback, useEffect, useState } from 'react';
import { AuthService } from '../services/auth.service';
import { NblocksConfig } from '../types/config';

export function useAuth(config?: NblocksConfig) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  
  // Initialize auth service if config is provided
  useEffect(() => {
    if (config) {
      AuthService.getInstance(config);
    }
  }, [config]);
  
  // Check authentication status
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const authService = AuthService.getInstance();
        const isAuth = await authService.isAuthenticated();
        setIsAuthenticated(isAuth);
      } catch (error) {
        console.error('Error checking authentication:', error);
        setIsAuthenticated(false);
      } finally {
        setIsLoading(false);
      }
    };
    
    checkAuth();
  }, []);
  
  // Login function
  const login = useCallback(async (options?: { redirectUri?: string }) => {
    const authService = AuthService.getInstance();
    await authService.login(options);
  }, []);
  
  // Logout function
  const logout = useCallback(() => {
    const authService = AuthService.getInstance();
    authService.logout();
    setIsAuthenticated(false);
  }, []);
  
  return {
    isAuthenticated,
    isLoading,
    login,
    logout
  };
} 