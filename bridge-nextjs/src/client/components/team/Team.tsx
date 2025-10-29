'use client';

import { useEffect, useRef, useState } from 'react';
import { useAuth,useTeamManagement } from '../../../client/hooks';
import { TokenService } from '../../../shared/services/token.service';

interface TeamProps {
  /**
   * Optional CSS class name for the component
   */
  className?: string;
}

/**
 * Team component that displays the team management UI in an iframe
 * 
 * @example
 * ```tsx
 * <Team />
 * ```
 */
export function Team({ className = '' }: TeamProps) {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { teamManagementUrl, error, isLoading: urlLoading, getTeamManagementUrl } = useTeamManagement();
  const [isInitialized, setIsInitialized] = useState(false);
  const [hasToken, setHasToken] = useState(false);
  const hasAttemptedFetch = useRef(false);

  // Check if token is available
  useEffect(() => {
    if (isAuthenticated) {
      const tokenService = TokenService.getInstance();
      const token = tokenService.getAccessTokenClient();
      
      // If token is not available from the token service, try to get it from cookies
      if (!token && typeof document !== 'undefined') {
        const cookies = document.cookie.split(';');
        const accessTokenCookie = cookies.find(cookie => cookie.trim().startsWith('bridge_access_token='));
        
        if (accessTokenCookie) {
          setHasToken(true);
          return;
        }
      }
      
      setHasToken(!!token);
    } else {
      setHasToken(false);
    }
  }, [isAuthenticated]);

  // Track if we're in the process of fetching the URL
  const isLoading = authLoading || urlLoading || (!isInitialized && isAuthenticated);

  useEffect(() => {
    // Only attempt to fetch the URL once and only if authenticated and has token
    if (isAuthenticated && hasToken && !hasAttemptedFetch.current && !isInitialized) {
      hasAttemptedFetch.current = true;
      
      // Add a small delay to ensure authentication is fully processed
      const timer = setTimeout(() => {
        getTeamManagementUrl()
          .then(() => setIsInitialized(true))
          .catch(err => {
            console.error('Failed to get team management URL:', err);
            hasAttemptedFetch.current = false; // Allow retry on error
          });
      }, 500);
      
      return () => clearTimeout(timer);
    }
  }, [isAuthenticated, hasToken, getTeamManagementUrl, isInitialized]);

  // Show authentication required message if not authenticated
  if (!isAuthenticated && !authLoading) {
    return (
      <div className="error-container">
        <h2>Authentication Required</h2>
        <p>You must be logged in to access team management.</p>
      </div>
    );
  }

  // Show token required message if authenticated but no token
  if (isAuthenticated && !hasToken && !authLoading) {
    return (
      <div className="error-container">
        <h2>Token Required</h2>
        <p>Authentication token not found. Please try logging in again.</p>
      </div>
    );
  }

  // Show error message if there's an error
  if (error) {
    return (
      <div className="error-container">
        <h2>Error</h2>
        <p>{error}</p>
      </div>
    );
  }

  // Show loading state while fetching the URL
  if (isLoading || !teamManagementUrl) {
    return (
      <div className="loading-container">
        <p>Loading team management...</p>
      </div>
    );
  }

  // Render the iframe with the team management URL
  return (
    <div className={`team-container ${className}`}>
      <iframe
        src={teamManagementUrl}
        title="Team Management"
        className="team-iframe"
      />
    </div>
  );
}

// Add styles to the component
const styles = `
  .team-container {
    display: block;
    width: 100%;
    height: 100%;
  }
  
  .team-iframe {
    width: 100%;
    min-height: 100vh;
    height: 100%;
    border: none;
    display: block;
  }
  
  .error-container {
    padding: 20px;
    text-align: center;
    color: #721c24;
    background-color: #f8d7da;
    border: 1px solid #f5c6cb;
    border-radius: 4px;
    margin: 20px;
  }
  
  .loading-container {
    padding: 20px;
    text-align: center;
    color: #004085;
    background-color: #cce5ff;
    border: 1px solid #b8daff;
    border-radius: 4px;
    margin: 20px;
  }
`;

// Add the styles to the document
if (typeof document !== 'undefined') {
  const styleElement = document.createElement('style');
  styleElement.textContent = styles;
  document.head.appendChild(styleElement);
} 