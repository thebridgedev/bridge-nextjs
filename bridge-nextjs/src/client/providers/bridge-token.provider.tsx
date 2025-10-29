'use client';

import { createContext, FC, ReactNode } from 'react';
import { useBridgeToken } from '../hooks/use-bridge-token';

interface BridgeTokenContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: (options?: { redirectUri?: string }) => Promise<void>;
  logout: () => void;
  getAccessToken: () => string | null;
  getRefreshToken: () => string | null;
  getIdToken: () => string | null;
}

export const BridgeTokenContext = createContext<BridgeTokenContextType>({
  isAuthenticated: false,
  isLoading: true,
  error: null,
  login: async () => {},
  logout: () => {},
  getAccessToken: () => null,
  getRefreshToken: () => null,
  getIdToken: () => null
});

interface BridgeTokenProviderProps {
  children: ReactNode;
}

/**
 * Provider component for bridge token management
 * 
 * @param props The provider props
 * @returns The provider component
 */
export const BridgeTokenProvider: FC<BridgeTokenProviderProps> = ({ children }) => {
  const tokenContext = useBridgeToken();
  
  return (
    <BridgeTokenContext.Provider value={tokenContext}>
      {children}
    </BridgeTokenContext.Provider>
  );
}; 