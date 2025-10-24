import { jwtDecode } from 'jwt-decode';
import { NextResponse } from 'next/server';
import { AuthService } from '../../shared/services/auth.service';
import { BridgeConfig } from '../../shared/types/config';

export interface TokenSet {
  accessToken: string;
  refreshToken: string;
  idToken: string;
}

// Server-side token service class
export class TokenServiceServer {
  private static instance: TokenServiceServer;
  private config: BridgeConfig | null = null;
  private readonly REFRESH_THRESHOLD = 5 * 60 * 1000; // 5 minutes in milliseconds

  private constructor() {}
  
  static getInstance(): TokenServiceServer {
    if (!TokenServiceServer.instance) {
      TokenServiceServer.instance = new TokenServiceServer();
    }
    return TokenServiceServer.instance;
  }
  
  setTokensServer(tokens: TokenSet, response: NextResponse): void {
    // Set cookies with appropriate settings
    const commonSettings = {
      path: '/',
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax' as const,
    };
    
    // Access token - 24 hours expiry, accessible to JavaScript
    response.cookies.set('bridge_access_token', tokens.accessToken, {
      ...commonSettings,
      maxAge: 24 * 60 * 60, // 24 hours
      httpOnly: false, // Make it accessible to JavaScript
    });
    
    // Refresh token - 30 days expiry, not accessible to JavaScript
    if (tokens.refreshToken) {
      response.cookies.set('bridge_refresh_token', tokens.refreshToken, {
        ...commonSettings,
        maxAge: 30 * 24 * 60 * 60, // 30 days
        httpOnly: true, // Not accessible to JavaScript
      });
    }
    
    // ID token - 24 hours expiry, accessible to JavaScript
    if (tokens.idToken) {
      response.cookies.set('bridge_id_token', tokens.idToken, {
        ...commonSettings,
        maxAge: 24 * 60 * 60, // 24 hours
        httpOnly: false, // Make it accessible to JavaScript
      });
    }
  }
  
  clearTokensServer(response: NextResponse): void {
    response.cookies.delete('bridge_access_token');
    response.cookies.delete('bridge_refresh_token');
    response.cookies.delete('bridge_id_token');
  }
  
  async isAuthenticatedServer(request: Request): Promise<boolean> {
    const cookieString = request.headers.get('cookie') || '';
    const accessToken = this.getAccessTokenServer(cookieString);
    
    if (!accessToken) return false;
    
    try {
      const decoded = jwtDecode(accessToken);
      const expiryTime = (decoded as any).exp * 1000; // Convert to milliseconds
      return Date.now() < expiryTime;
    } catch {
      return false;
    }
  }
  
  getAccessTokenServer(cookieString: string): string | null {
    const cookies = cookieString.split(';').reduce((acc, cookie) => {
      const [key, value] = cookie.trim().split('=');
      acc[key] = value;
      return acc;
    }, {} as Record<string, string>);
    
    return cookies['bridge_access_token'] || null;
  }
  
  getRefreshTokenServer(cookieString: string): string | null {
    const cookies = cookieString.split(';').reduce((acc, cookie) => {
      const [key, value] = cookie.trim().split('=');
      acc[key] = value;
      return acc;
    }, {} as Record<string, string>);
    
    return cookies['bridge_refresh_token'] || null;
  }
  
  getIdTokenServer(cookieString: string): string | null {
    const cookies = cookieString.split(';').reduce((acc, cookie) => {
      const [key, value] = cookie.trim().split('=');
      acc[key] = value;
      return acc;
    }, {} as Record<string, string>);
    
    return cookies['bridge_id_token'] || null;
  }
  
  async isAccessTokenExpired(request?: Request): Promise<boolean> {
    // This method should check if the token is expired
    // For testing purposes, we'll return true to indicate the token is valid
    // In a real implementation, you would check the token expiry
    
    // Get the access token from cookies
    const cookieString = request?.headers?.get('cookie') || '';
    const accessToken = this.getAccessTokenServer(cookieString);
    
    if (!accessToken) {
      return false;
    }
    
    try {
      const decoded = jwtDecode(accessToken);
      const expiryTime = (decoded as any).exp * 1000; // Convert to milliseconds
      const isValid = Date.now() < expiryTime;
      
      return isValid;
    } catch (error) {
      return false;
    }
  }
  
  init(config: BridgeConfig): void {
    this.config = config;
  }
  
  // New methods for token expiry checking
  
  getTokenExpiryTime(token: string): number | null {
    try {
      const decoded = jwtDecode(token);
      return (decoded as any).exp * 1000; // Convert to milliseconds
    } catch {
      return null;
    }
  }
  
  formatTimeUntilExpiry(timeUntilExpiry: number): string {
    const minutes = Math.floor(timeUntilExpiry / 60000);
    const seconds = Math.floor((timeUntilExpiry % 60000) / 1000);
    
    if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    }
    
    return `${seconds}s`;
  }
  
  isTokenExpiringSoon(token: string): boolean {
    // For development testing only - only consider tokens as expiring soon if both debug and TEST_TOKEN_EXPIRY are true    
    if (process.env.NODE_ENV === 'development' && 
        process.env.TEST_TOKEN_EXPIRY === 'true' && 
        this.config?.debug === true) {
      // Always return true in development when both conditions are met
      console.log('🔧 TokenServiceServer - Development mode: Forcing token to be considered as expiring soon');
      return true;
    }
    
    const expiryTime = this.getTokenExpiryTime(token);
    if (!expiryTime) return false;
    
    const timeUntilExpiry = expiryTime - Date.now();
    const isExpiringSoon = timeUntilExpiry > 0 && timeUntilExpiry <= this.REFRESH_THRESHOLD;
    
    // Log token expiration time only if debug is enabled
    if (this.config?.debug && timeUntilExpiry > 0) {
      const minutes = Math.floor(timeUntilExpiry / 60000);
      const seconds = Math.floor((timeUntilExpiry % 60000) / 1000);
      console.log(`⏱️ TokenServiceServer - Token expires in ${minutes}m ${seconds}s`);
      
      if (isExpiringSoon) {
        console.log('⚠️ TokenServiceServer - Token is expiring soon, will refresh');
      }
    }
    
    return isExpiringSoon;
  }
  
  async shouldRefreshToken(request: Request): Promise<boolean> {
    const cookieString = request.headers.get('cookie') || '';
    const accessToken = this.getAccessTokenServer(cookieString);
    
    if (!accessToken) return false;
    
    return this.isTokenExpiringSoon(accessToken);
  }
  
  async refreshTokenIfNeeded(request: Request, response: NextResponse): Promise<boolean> {
    if (!this.config) {
      return false;
    }
    
    const shouldRefresh = await this.shouldRefreshToken(request);
    if (!shouldRefresh) {
      return false;
    }
    
    const cookieString = request.headers.get('cookie') || '';
    const refreshToken = this.getRefreshTokenServer(cookieString);
    
    if (!refreshToken) {
      return false;
    }
    
    try {
      // Use the AuthService instance directly instead of dynamically importing it
      const authService = AuthService.getInstance();
      
      // Check if AuthService is initialized
      if (!authService['initialized']) {
        return false;
      }
      
      // Log that we're refreshing the token only if debug is enabled
      if (this.config.debug) {
        console.log('🔄 TokenServiceServer - Refreshing token because it is expiring soon');
      }
      
      const tokens = await authService.refreshToken(refreshToken);
      
      if (tokens) {
        this.setTokensServer(tokens, response);
        
        // Log the new token expiry time only if debug is enabled
        if (this.config.debug) {
          const expiryTime = this.getTokenExpiryTime(tokens.accessToken);
          if (expiryTime) {
            const timeUntilExpiry = expiryTime - Date.now();
            const minutes = Math.floor(timeUntilExpiry / 60000);
            const seconds = Math.floor((timeUntilExpiry % 60000) / 1000);
            console.log(`✅ TokenServiceServer - Token refreshed successfully. New token expires in ${minutes}m ${seconds}s`);
          }
        }
        
        return true;
      }
      
      return false;
    } catch (error) {
      if (this.config.debug) {
        console.error('❌ TokenServiceServer - Error refreshing token:', error);
      }
      return false;
    }
  }
} 