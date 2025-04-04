'use client';

import { useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { NblocksConfig } from '../../types/config';

interface LoginProps {
  config?: NblocksConfig;
  redirectUri?: string;
  className?: string;
  children?: React.ReactNode;
}

export function Login({ config, redirectUri, className, children }: LoginProps) {
  const { login } = useAuth(config);
  
  const handleLogin = async () => {
    await login({ redirectUri });
  };
  
  // Auto-login on component mount if no children provided
  useEffect(() => {
    if (!children) {
      handleLogin();
    }
  }, []);
  
  if (children) {
    return (
      <button 
        onClick={handleLogin} 
        className={className}
      >
        {children}
      </button>
    );
  }
  
  // Return null if auto-login is used
  return null;
} 