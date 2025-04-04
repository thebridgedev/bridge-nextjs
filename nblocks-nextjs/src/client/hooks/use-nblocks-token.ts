import { useCallback, useEffect, useState } from 'react';
import { AuthService } from '../../shared/services/auth.service';
import { TokenService } from '../../shared/services/token.service';
import { useNblocksConfig } from './use-nblocks-config';

// Initialize services outside component
const tokenService = TokenService.getInstance();
const authService = AuthService.getInstance();

/**
 * Hook for accessing nBlocks token functionality
 * 
 * @returns Token context values and functions
 * 
 * @example
 * import { useNblocksToken } from 'nblocks-nextjs';
 * 
 * function MyComponent() {
 *   const { isAuthenticated, login, logout } = useNblocksToken();
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
export const useNblocksToken = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const config = useNblocksConfig();
  
  // Initialize token service
  useEffect(() => {
    tokenService.init(config);
  }, [config]);
  
  // Check authentication status
  useEffect(() => {
    let isMounted = true;
    
    const checkAuth = async () => {
      try {
        const isAuth = await tokenService.isAuthenticatedClient();
        
        // Only update state if component is still mounted
        if (isMounted) {
          setIsAuthenticated(isAuth);
          setIsLoading(false);
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'An unknown error occurred');
          setIsLoading(false);
        }
      }
    };

    checkAuth();
    
    return () => {
      isMounted = false;
    };
  }, []);

  const login = useCallback(async (options?: { redirectUri?: string }) => {
    try {
      setIsLoading(true);
      await authService.login(options);
      setIsAuthenticated(true);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
      setIsAuthenticated(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    try {
      tokenService.clearTokensClient();
      setIsAuthenticated(false);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
    }
  }, []);

  const getAccessToken = useCallback(() => {
    return tokenService.getAccessTokenClient();
  }, []);

  const getRefreshToken = useCallback(() => {
    return tokenService.getRefreshTokenClient();
  }, []);

  const getIdToken = useCallback(() => {
    return tokenService.getIdTokenClient();
  }, []);

  return {
    isAuthenticated,
    isLoading,
    error,
    login,
    logout,
    getAccessToken,
    getRefreshToken,
    getIdToken,
  };
}; 