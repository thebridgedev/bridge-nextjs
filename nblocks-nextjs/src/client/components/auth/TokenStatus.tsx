'use client';

import React, { useEffect, useState } from 'react';
import { useNblocksToken } from '../../../client/hooks/use-nblocks-token';
import { TokenService } from '../../../shared/services/token.service';

export interface TokenStatusProps {
  /**
   * Additional CSS class names
   */
  className?: string;
}

/**
 * Component to display token status
 * 
 * @param props The component props
 * @returns The component
 * 
 * @example
 * // In your component
 * import { TokenStatus } from 'nblocks-nextjs';
 * 
 * function MyComponent() {
 *   return (
 *     <div>
 *       <h2>Authentication Status</h2>
 *       <TokenStatus />
 *     </div>
 *   );
 * }
 */
export const TokenStatus: React.FC<TokenStatusProps> = ({ className }) => {
  const { isAuthenticated, isLoading, getAccessToken, getRefreshToken, getIdToken } = useNblocksToken();
  const tokenService = TokenService.getInstance();
  const [hasToken, setHasToken] = useState<boolean>(false);
  const [tokenExpiresIn, setTokenExpiresIn] = useState<number | null>(null);
  const [lastRenewal, setLastRenewal] = useState<number | null>(null);
  const [isRenewing, setIsRenewing] = useState<boolean>(false);
  
  useEffect(() => {
    console.log('TokenStatus - Component mounted');
    
    // Check if token is available
    const accessToken = getAccessToken();
    console.log('TokenStatus - accessToken available:', !!accessToken);
    
    if (accessToken) {
      setHasToken(true);
      
      // Calculate token expiry time
      const expiryTime = tokenService.getTokenExpiryTime(accessToken);
      if (expiryTime) {
        const timeUntilExpiry = expiryTime - Date.now();
        setTokenExpiresIn(Math.floor(timeUntilExpiry / 1000)); // Convert to seconds
      }
    } else {
      setHasToken(false);
      setTokenExpiresIn(null);
    }
    
    // Set up interval to update token expiry time
    const interval = setInterval(() => {
      const accessToken = getAccessToken();
      if (accessToken) {
        const expiryTime = tokenService.getTokenExpiryTime(accessToken);
        if (expiryTime) {
          const timeUntilExpiry = expiryTime - Date.now();
          setTokenExpiresIn(Math.floor(timeUntilExpiry / 1000)); // Convert to seconds
        }
      }
    }, 1000);
    
    return () => clearInterval(interval);
  }, [getAccessToken]);
  
  // Function to refresh token
  const refreshToken = async () => {
    if (isRenewing) return;
    
    setIsRenewing(true);
    try {
      const success = await tokenService.refreshTokenClient();
      if (success) {
        setLastRenewal(Date.now());
        console.log('TokenStatus - Token refreshed successfully');
      } else {
        console.log('TokenStatus - Token refresh failed');
      }
    } catch (error) {
      console.error('TokenStatus - Error refreshing token:', error);
    } finally {
      setIsRenewing(false);
    }
  };
  
  // Format the time until expiry
  const formatExpiryTime = (seconds: number | null): string => {
    console.log('TokenStatus.formatExpiryTime - seconds:', seconds);
    
    if (seconds === null) return 'No token';
    
    if (seconds < 0) return 'Expired';
    
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    
    if (minutes > 0) {
      return `${minutes}m ${remainingSeconds}s`;
    }
    
    return `${remainingSeconds}s`;
  };

  // Format the last renewal time
  const formatLastRenewal = (): string => {
    console.log('TokenStatus.formatLastRenewal - lastRenewal:', lastRenewal);
    
    if (!lastRenewal) return 'No renewals yet';
    
    const date = new Date(lastRenewal);
    return date.toLocaleTimeString();
  };

  return (
    <div className={`nblocks-token-status ${className || ''}`}>
      <h3>Token Status</h3>
      <div className="nblocks-token-status-content">
        <p>
          <strong>Token expires in:</strong> {formatExpiryTime(tokenExpiresIn)}
        </p>
        <p>
          <strong>Last renewal:</strong> {formatLastRenewal()}
        </p>
        <p>
          <strong>Status:</strong>{' '}
          <span className={`nblocks-renewal-status ${isRenewing ? 'nblocks-renewing' : ''}`}>
            {isRenewing ? 'Renewing...' : 'Idle'}
          </span>
        </p>
        {hasToken && (
          <button
            className="nblocks-refresh-button"
            onClick={refreshToken}
            disabled={isRenewing}
          >
            Refresh Token
          </button>
        )}
      </div>
    </div>
  );
}; 