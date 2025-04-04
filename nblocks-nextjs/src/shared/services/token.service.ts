import { jwtDecode } from 'jwt-decode';
import { create } from 'zustand';
import { NblocksConfig } from '../types/config';
import { AuthService } from './auth.service';

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

// Create a Zustand store for client-side token management
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
  private config: NblocksConfig | null = null;
  private refreshCheckInterval: NodeJS.Timeout | null = null;
  private isRefreshing = false;
  private lastRenewalTime: Date | null = null;
  private readonly REFRESH_THRESHOLD = 5 * 60 * 1000; // 5 minutes in milliseconds

  private constructor() {}
  
  static getInstance(): TokenService {
    if (!TokenService.instance) {
      TokenService.instance = new TokenService();
    }
    return TokenService.instance;
  }
  
  // Helper method to get a cookie value by name
  private getCookieValue(name: string): string | null {
    if (typeof document === 'undefined') return null;
    
    const cookies = document.cookie.split(';');
    const cookie = cookies.find(c => c.trim().startsWith(`${name}=`));
    
    if (cookie) {
      const value = cookie.split('=')[1];
      return value;
    }
    
    return null;
  }

  // Helper method to get all tokens from cookies
  private getTokensFromCookies(): TokenSet | null {
    const accessToken = this.getCookieValue('nblocks_access_token');
    const idToken = this.getCookieValue('nblocks_id_token');
    
    if (accessToken && idToken) {
      return { 
        accessToken, 
        idToken,
        refreshToken: '' // Empty string since refresh token is server-side only
      };
    }
    
    return null;
  }

  // Helper method to validate a token
  private isValidToken(token: string): boolean {
    try {
      const decoded = jwtDecode(token);
      const expiryTime = (decoded as any).exp * 1000; // Convert to milliseconds
      const isValid = Date.now() < expiryTime;
      return isValid;
    } catch (error) {
      return false;
    }
  }

  // Helper method to sync tokens from cookies to store
  private syncTokensFromCookiesToStore(): boolean {
    const tokens = this.getTokensFromCookies();
    
    if (tokens && this.isValidToken(tokens.accessToken)) {
      useTokenStore.getState().setTokens(tokens);
      return true;
    }
    
    return false;
  }
  
  // Client-side methods
  setTokensClient(tokens: TokenSet): void {
    // Set in localStorage
    useTokenStore.getState().setTokens(tokens);
    
    // Also set in cookies
    if (typeof document !== 'undefined') {
      const cookieOptions = 'path=/; max-age=86400'; // 24 hours
      document.cookie = `nblocks_access_token=${tokens.accessToken}; ${cookieOptions}`;
      document.cookie = `nblocks_id_token=${tokens.idToken}; ${cookieOptions}`;
    }
  }
  
  clearTokensClient(): void {
    // Clear from localStorage
    useTokenStore.getState().clearTokens();
    
    // Also clear from cookies
    if (typeof document !== 'undefined') {
      document.cookie = 'nblocks_access_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
      document.cookie = 'nblocks_id_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    }
  }
  
  async isAuthenticatedClient(): Promise<boolean> {
    // First check localStorage via token store
    const localStorageResult = useTokenStore.getState().isAuthenticated();
    
    if (localStorageResult) {
      return true;
    }
    
    // If not in localStorage, check cookies and sync if valid
    const result = this.syncTokensFromCookiesToStore();
    return result;
  }
  
  getAccessTokenClient(): string | null {
    // Try to get from localStorage first
    const accessToken = useTokenStore.getState().getAccessToken();
    
    if (accessToken) {
      return accessToken;
    }
    
    // If not in localStorage, check cookies and sync if valid
    this.syncTokensFromCookiesToStore();
    return useTokenStore.getState().getAccessToken();
  }
  
  getIdTokenClient(): string | null {
    // Try to get from localStorage first
    const idToken = useTokenStore.getState().getIdToken();
    
    if (idToken) {
      return idToken;
    }
    
    // If not in localStorage, check cookies and sync if valid
    this.syncTokensFromCookiesToStore();
    return useTokenStore.getState().getIdToken();
  }
  
  getRefreshTokenClient(): string | null {
    // Refresh token is only stored in localStorage for security
    return useTokenStore.getState().getRefreshToken();
  }
  
  // Common methods
  init(config: NblocksConfig): void {
    this.config = config;
    this._startTokenExpiryCheck();
  }
  
  async refreshTokenClient(): Promise<boolean> {
    if (this.isRefreshing) {
      return false;
    }
    
    try {
      this.isRefreshing = true;
      
      // Get refresh token from store
      const refreshToken = useTokenStore.getState().getRefreshToken();
      
      if (!refreshToken) {
        return false;
      }
      
      // Use AuthService to refresh the token
      const authService = AuthService.getInstance();
      if (!this.config) {
        throw new Error('TokenService not initialized - call init() first');
      }
      authService.init(this.config);
      
      const tokens = await authService.refreshToken(refreshToken);
      if (!tokens) {
        return false;
      }
      
      // Store the new tokens
      this.setTokensClient(tokens);
      this.lastRenewalTime = new Date();
      
      return true;
    } catch (error) {
      return false;
    } finally {
      this.isRefreshing = false;
    }
  }
  
  getTokenExpiryTime(token: string): number | null {
    try {
      const decoded = jwtDecode(token);
      return (decoded as any).exp * 1000;
    } catch {
      return null;
    }
  }
  
  formatTimeUntilExpiry(timeUntilExpiry: number): string {
    const minutes = Math.floor(timeUntilExpiry / 60000);
    const seconds = Math.floor((timeUntilExpiry % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
  }
  
  private getNextCheckInterval(timeUntilExpiry: number): number {
    // Check 5 minutes before expiry, or half the time until expiry if it's less than 10 minutes
    return Math.min(timeUntilExpiry - this.REFRESH_THRESHOLD, timeUntilExpiry / 2);
  }
  
  startTokenExpiryCheck() {
    this._startTokenExpiryCheck();
  }
  
  stopTokenExpiryCheck() {
    this._stopTokenExpiryCheck();
  }
  
  private _startTokenExpiryCheck() {
    this._stopTokenExpiryCheck();

    const token = this.getAccessTokenClient();
    
    if (!token) {
      return;
    }

    const expiryTime = this.getTokenExpiryTime(token);
    
    if (!expiryTime) {
      return;
    }

    const timeUntilExpiry = expiryTime - Date.now();
    
    if (timeUntilExpiry <= 0) {
      return;
    }

    const nextCheckInterval = this.getNextCheckInterval(timeUntilExpiry);
    
    const minutes = Math.floor(timeUntilExpiry / 60000);
    const seconds = Math.floor((timeUntilExpiry % 60000) / 1000);
    
    this.refreshCheckInterval = setTimeout(async () => {
      const success = await this.refreshTokenClient();
      
      if (success) {
        this._startTokenExpiryCheck(); // Restart the check with the new token
      } else {
        this.clearTokensClient();
      }
    }, nextCheckInterval);
  }
  
  private _stopTokenExpiryCheck() {
    if (this.refreshCheckInterval) {
      clearTimeout(this.refreshCheckInterval);
      this.refreshCheckInterval = null;
    }
  }
  
  /**
   * Check if an access token is available (either in the store or in cookies)
   */
  hasAccessToken(): boolean {
    return !!this.getAccessTokenClient();
  }
  
  /**
   * Check if the access token is expired
   * This is a bit confusing, but the middleware is checking if the token is expired
   * So we need to return true if the token is NOT expired
   */
  async isAccessTokenExpired(): Promise<boolean> {
    const token = this.getAccessTokenClient();
    if (!token) return true;
    
    try {
      const decoded = jwtDecode(token);
      const expiryTime = (decoded as any).exp * 1000;
      return Date.now() >= expiryTime;
    } catch {
      return true;
    }
  }

  // Convenience methods
  hasValidAccessToken(): boolean {
    const token = this.getAccessTokenClient();
    if (!token) return false;
    
    try {
      const decoded = jwtDecode(token);
      const expiryTime = (decoded as any).exp * 1000;
      return Date.now() < expiryTime;
    } catch {
      return false;
    }
  }
} 