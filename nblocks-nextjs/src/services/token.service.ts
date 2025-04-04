import { jwtDecode } from 'jwt-decode';
import { create } from 'zustand';

export interface TokenSet {
  accessToken: string;
  refreshToken: string;
  idToken: string;
}

interface TokenState {
  accessToken: string | null;
  refreshToken: string | null;
  idToken: string | null;
  setTokens: (tokens: TokenSet) => void;
  clearTokens: () => void;
  isAuthenticated: () => boolean;
  getAccessToken: () => string | null;
  getRefreshToken: () => string | null;
  getIdToken: () => string | null;
}

// Create a Zustand store for token management
export const useTokenStore = create<TokenState>((set, get) => ({
  accessToken: typeof window !== 'undefined' ? localStorage.getItem('nblocks_access_token') : null,
  refreshToken: typeof window !== 'undefined' ? localStorage.getItem('nblocks_refresh_token') : null,
  idToken: typeof window !== 'undefined' ? localStorage.getItem('nblocks_id_token') : null,
  
  setTokens: (tokens: TokenSet) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('nblocks_access_token', tokens.accessToken);
      localStorage.setItem('nblocks_refresh_token', tokens.refreshToken);
      localStorage.setItem('nblocks_id_token', tokens.idToken);
    }
    set({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      idToken: tokens.idToken
    });
  },
  
  clearTokens: () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('nblocks_access_token');
      localStorage.removeItem('nblocks_refresh_token');
      localStorage.removeItem('nblocks_id_token');
    }
    set({
      accessToken: null,
      refreshToken: null,
      idToken: null
    });
  },
  
  isAuthenticated: () => {
    const accessToken = get().accessToken;
    if (!accessToken) return false;
    
    try {
      const decoded = jwtDecode(accessToken);
      const expiryTime = (decoded as any).exp * 1000; // Convert to milliseconds
      return Date.now() < expiryTime;
    } catch {
      return false;
    }
  },
  
  getAccessToken: () => get().accessToken,
  getRefreshToken: () => get().refreshToken,
  getIdToken: () => get().idToken
}));

// Token service class for more complex operations
export class TokenService {
  private static instance: TokenService;
  private refreshInProgress = false;
  private refreshPromise: Promise<void> | null = null;
  
  private constructor() {}
  
  static getInstance(): TokenService {
    if (!TokenService.instance) {
      TokenService.instance = new TokenService();
    }
    return TokenService.instance;
  }
  
  async refreshToken(config: { authBaseUrl: string; appId: string }): Promise<void> {
    if (this.refreshInProgress) {
      return this.refreshPromise!;
    }
    
    this.refreshInProgress = true;
    this.refreshPromise = (async () => {
      try {
        const refreshToken = useTokenStore.getState().getRefreshToken();
        if (!refreshToken) {
          throw new Error('No refresh token available');
        }
        
        const response = await fetch(`${config.authBaseUrl}/token`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            client_id: config.appId,
            grant_type: 'refresh_token',
            refresh_token: refreshToken
          }),
        });
        
        if (!response.ok) {
          throw new Error('Failed to refresh token');
        }
        
        const data = await response.json();
        useTokenStore.getState().setTokens({
          accessToken: data.access_token,
          refreshToken: data.refresh_token,
          idToken: data.id_token
        });
      } catch (error) {
        console.error('Error refreshing token:', error);
        useTokenStore.getState().clearTokens();
        throw error;
      } finally {
        this.refreshInProgress = false;
      }
    })();
    
    return this.refreshPromise;
  }
  
  async isAccessTokenExpired(): Promise<boolean> {
    const accessToken = useTokenStore.getState().getAccessToken();
    if (!accessToken) return true;
    
    try {
      const decoded = jwtDecode(accessToken);
      const expiryTime = (decoded as any).exp * 1000; // Convert to milliseconds
      return Date.now() >= expiryTime;
    } catch {
      return true;
    }
  }
  
  async isAuthenticated(): Promise<boolean> {
    return !(await this.isAccessTokenExpired());
  }
} 