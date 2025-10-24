import { NextResponse } from 'next/server';
import { TokenServiceServer } from '../../server/utils/token-service.server';
import { BridgeConfig } from '../types/config';
import { TokenService, TokenSet } from './token.service';

export class AuthService {
  private static instance: AuthService;
  private tokenService: TokenService;
  private tokenServerService: TokenServiceServer;
  private config: BridgeConfig | null = null;
  private initialized: boolean = false;
  
  private constructor() {
    this.tokenService = TokenService.getInstance();
    this.tokenServerService = TokenServiceServer.getInstance();
  }
  
  static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }
  
  /**
   * Initialize the service with the required configuration
   */
  init(config: BridgeConfig): void {
    this.config = config;
    this.initialized = true;
  }
  
  /**
   * Creates the bridge login URL
   * @param options Optional redirect URI
   * @param currentOrigin Optional current origin (for server-side usage)
   * @returns The complete login URL
   */
  createLoginUrl(options: { redirectUri?: string } = {}, currentOrigin?: string): string {
    if (!this.initialized || !this.config) {
      throw new Error('AuthService has not been properly initialized.');
    }
    
    const origin = currentOrigin || (typeof window !== 'undefined' ? window.location.origin : '');
    const redirectUri = options.redirectUri || 
      this.config.callbackUrl || 
      `${origin}/auth/oauth-callback`;
    
    const authBaseUrl = this.config.authBaseUrl;
    return `${authBaseUrl}/url/login/${this.config.appId}?cv_env=bridge&redirect_uri=${encodeURIComponent(redirectUri)}`;
  }
  
  // Client-side methods
  async loginClient(options: { redirectUri?: string } = {}): Promise<void> {
    if (!this.initialized || !this.config) {
      throw new Error('AuthService has not been properly initialized.');
    }
    
    const loginUrl = this.createLoginUrl(options);
    
    if (typeof window !== 'undefined') {
      window.location.href = loginUrl;
    }
  }
  
  async handleCallbackClient(code: string): Promise<void> {
    if (!this.initialized || !this.config) {
      throw new Error('AuthService has not been properly initialized.');
    }
    
    if (!code) {
      throw new Error('No authorization code provided');
    }
    
    const tokens = await this.exchangeCode(code);
    this.tokenService.setTokensClient(tokens);
  }
  
  logoutClient(): void {
    this.tokenService.clearTokensClient();
  }
  
  async isAuthenticatedClient(): Promise<boolean> {
    if (!this.initialized || !this.config) {
      throw new Error('AuthService has not been properly initialized.');
    }
    
    return await this.tokenService.isAuthenticatedClient();
  }
  
  // Server-side methods
  async handleCallbackServer(code: string, response: NextResponse): Promise<void> {
    if (!this.initialized || !this.config) {
      throw new Error('AuthService has not been properly initialized.');
    }
    
    if (!code) {
      throw new Error('No authorization code provided');
    }
    
    const tokens = await this.exchangeCode(code);
    
    this.tokenServerService.setTokensServer(tokens, response);
  }
  
  logoutServer(response: NextResponse): void {
    this.tokenServerService.clearTokensServer(response);
  }
  
  async isAuthenticatedServer(request: Request): Promise<boolean> {
    if (!this.initialized || !this.config) {
      throw new Error('AuthService has not been properly initialized.');
    }
    
    return await this.tokenServerService.isAuthenticatedServer(request);
  }
  
  // Shared methods
  private async exchangeCode(code: string): Promise<TokenSet> {
    if (!this.initialized || !this.config) {
      throw new Error('AuthService has not been properly initialized.');
    }
    
    const authBaseUrl = this.config.authBaseUrl
    const url = `${authBaseUrl}/token/code/${this.config.appId}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ code }),
    });
    console.log(url);
    if (!response.ok) {
      throw new Error('Failed to exchange code for tokens');
    }
    
    const data = await response.json();
    
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      idToken: data.id_token
    };
  }
  
  // Legacy methods for backward compatibility
  async login(options: { redirectUri?: string } = {}): Promise<void> {
    return this.loginClient(options);
  }
  
  async handleCallback(code: string): Promise<void> {
    return this.handleCallbackClient(code);
  }
  
  logout(): void {
    this.logoutClient();
  }
  
  async isAuthenticated(): Promise<boolean> {
    return await this.isAuthenticatedClient();
  }
  
  // Add refresh token method
  async refreshToken(refreshToken: string): Promise<TokenSet | null> {
    if (!this.initialized || !this.config) {
      throw new Error('AuthService has not been properly initialized.');
    }
    
    if (!refreshToken) {
      if (this.config.debug) {
        console.log('AuthService - No refresh token provided');
      }
      return null;
    }
    
    try {
      const authBaseUrl = this.config.authBaseUrl || 'https://auth.bridge.cloud';
      const url = `${authBaseUrl}/token`;
      
      // Log the start time of the refresh
      const startTime = Date.now();
      
      // Only log if debug is enabled
      if (this.config.debug) {
        console.log("🔄 AuthService - Refreshing token:", url);
      }
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          client_id: this.config.appId,
          grant_type: 'refresh_token',
          refresh_token: refreshToken
        }),
      });
      
      if (!response.ok) {
        if (this.config.debug) {
          console.error('AuthService - Failed to refresh token:', await response.text());
        }
        return null;
      }
      
      // Calculate how long the refresh took and log it if debug is enabled
      if (this.config.debug) {
        const endTime = Date.now();
        const refreshTime = endTime - startTime;
        console.log(`⏱️ AuthService - Token refreshing token, took ${refreshTime}ms`);        
      }
      
      const data = await response.json();
      
      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        idToken: data.id_token
      };
    } catch (error) {
      if (this.config.debug) {
        console.error('AuthService - Error refreshing token:', error);
      }
      return null;
    }
  }
} 