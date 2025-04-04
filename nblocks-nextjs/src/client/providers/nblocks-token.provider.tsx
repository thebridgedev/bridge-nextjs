import React, { ReactNode, createContext } from 'react';
import { useNblocksToken } from '../hooks/use-nblocks-token';

interface NblocksTokenContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: (options?: { redirectUri?: string }) => Promise<void>;
  logout: () => void;
  getAccessToken: () => string | null;
  getRefreshToken: () => string | null;
  getIdToken: () => string | null;
}

export const NblocksTokenContext = createContext<NblocksTokenContextType>({
  isAuthenticated: false,
  isLoading: true,
  error: null,
  login: async () => {},
  logout: () => {},
  getAccessToken: () => null,
  getRefreshToken: () => null,
  getIdToken: () => null
});

interface NblocksTokenProviderProps {
  children: ReactNode;
}

/**
 * Provider component for nBlocks token management
 * 
 * @param props The provider props
 * @returns The provider component
 */
export const NblocksTokenProvider: React.FC<NblocksTokenProviderProps> = ({ children }) => {
  const tokenContext = useNblocksToken();
  
  return (
    <NblocksTokenContext.Provider value={tokenContext}>
      {children}
    </NblocksTokenContext.Provider>
  );
}; 