import { NblocksConfig } from '../types/config';
import { TokenService, TokenSet, useTokenStore } from './token.service';

export class AuthService {
  private static instance: AuthService;
  private tokenService: TokenService;
  private config: NblocksConfig;
  
  private constructor(config: NblocksConfig) {
    this.config = config;
    this.tokenService = TokenService.getInstance();
  }
  
  static getInstance(config?: NblocksConfig): AuthService {
    if (!AuthService.instance && config) {
      AuthService.instance = new AuthService(config);
    }
    return AuthService.instance;
  }
  
  async login(options: { redirectUri?: string } = {}): Promise<void> {
    const redirectUri = options.redirectUri || 
      this.config.callbackUrl || 
      `${typeof window !== 'undefined' ? window.location.origin : ''}/auth/callback`;
    
    const authBaseUrl = this.config.authBaseUrl || 'https://auth.nblocks.cloud';
    const loginUrl = `${authBaseUrl}/url/login/${this.config.appId}?redirect_uri=${encodeURIComponent(redirectUri)}`;
    
    if (typeof window !== 'undefined') {
      window.location.href = loginUrl;
    }
  }
  
  async handleCallback(code: string): Promise<void> {
    if (!code) {
      throw new Error('No authorization code provided');
    }
    
    const tokens = await this.exchangeCode(code);
    useTokenStore.getState().setTokens(tokens);
  }
  
  logout(): void {
    useTokenStore.getState().clearTokens();
  }
  
  private async exchangeCode(code: string): Promise<TokenSet> {
    const authBaseUrl = this.config.authBaseUrl || 'https://auth.nblocks.cloud';
    const url = `${authBaseUrl}/token/code/${this.config.appId}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ code }),
    });
    
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
  
  async isAuthenticated(): Promise<boolean> {
    return this.tokenService.isAuthenticated();
  }
} 