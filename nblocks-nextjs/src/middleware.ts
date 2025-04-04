import { NextRequest, NextResponse } from 'next/server';
import { TokenService } from './services/token.service';

export interface WithAuthOptions {
  config?: {
    appId: string;
    authBaseUrl?: string;
    loginRoute?: string;
  };
  publicPaths?: string[];
}

export function withAuth(options: WithAuthOptions = {}) {
  const {
    config = {
      appId: process.env.NBLOCKS_APP_ID || '',
      authBaseUrl: process.env.NBLOCKS_AUTH_BASE_URL || 'https://auth.nblocks.cloud',
      loginRoute: '/login'
    },
    publicPaths = ['/login', '/auth/callback']
  } = options;
  
  return async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;
    
    // Allow public paths
    if (publicPaths.some(path => pathname.startsWith(path))) {
      return NextResponse.next();
    }
    
    // Check for access token in cookies
    const accessToken = request.cookies.get('nblocks_access_token')?.value;
    
    if (!accessToken) {
      // Redirect to login if no token
      const loginUrl = new URL(config.loginRoute || '/login', request.url);
      return NextResponse.redirect(loginUrl);
    }
    
    // Verify token validity
    try {
      const tokenService = TokenService.getInstance();
      const isValid = await tokenService.isAccessTokenExpired();
      
      if (!isValid) {
        // Token is valid, proceed
        return NextResponse.next();
      }
    } catch (error) {
      console.error('Error verifying token:', error);
    }
    
    // Redirect to login if token is invalid
    const loginUrl = new URL(config.loginRoute || '/login', request.url);
    return NextResponse.redirect(loginUrl);
  };
}

export default withAuth(); 