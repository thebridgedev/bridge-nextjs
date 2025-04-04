import { useCallback, useEffect, useState } from 'react';
import { AuthService } from '../../shared/services/auth.service';
import { useNblocksConfig } from './use-nblocks-config';

/**
 * Hook for authentication functionality
 * 
 * @returns Authentication functions and state
 * 
 * @example
 * import { useAuth } from 'nblocks-nextjs';
 * 
 * function MyComponent() {
 *   const { 
 *     isAuthenticated, 
 *     login, 
 *     logout 
 *   } = useAuth();
 *   
 *   return (
 *     <div>
 *       {isAuthenticated ? (
 *         <button onClick={logout}>Logout</button>
 *       ) : (
 *         <button onClick={() => login()}>Login</button>
 *       )}
 *     </div>
 *   );
 * }
 */
export function useAuth() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  
  const config = useNblocksConfig();
  
  // Initialize auth service
  useEffect(() => {
    const authService = AuthService.getInstance();
    authService.init(config);
  }, [config]);
  
  // Check authentication status
  useEffect(() => {
    const checkAuth = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        const authService = AuthService.getInstance();
        const authenticated = await authService.isAuthenticatedClient();
        setIsAuthenticated(authenticated);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to check authentication status';
        setError(errorMessage);
        setIsAuthenticated(false);
      } finally {
        setIsLoading(false);
      }
    };
    
    checkAuth();
  }, []);
  
  // Login function
  const login = useCallback(async (options?: { redirectUri?: string }): Promise<void> => {
    setIsLoading(true);
    setError(null);
    
    try {
      const authService = AuthService.getInstance();
      await authService.loginClient(options);
      // Note: This will redirect the user, so the code below won't execute
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to login';
      setError(errorMessage);
      setIsLoading(false);
    }
  }, []);
  
  // Logout function
  const logout = useCallback((): void => {
    setIsLoading(true);
    setError(null);
    
    try {
      const authService = AuthService.getInstance();
      authService.logoutClient();
      setIsAuthenticated(false);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to logout';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, []);
  
  // Handle callback function
  const handleCallback = useCallback(async (code: string): Promise<void> => {
    setIsLoading(true);
    setError(null);
    
    try {
      const authService = AuthService.getInstance();
      await authService.handleCallbackClient(code);
      setIsAuthenticated(true);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to handle callback';
      setError(errorMessage);
      setIsAuthenticated(false);
    } finally {
      setIsLoading(false);
    }
  }, []);
  
  return {
    isAuthenticated,
    isLoading,
    error,
    login,
    logout,
    handleCallback
  };
} 