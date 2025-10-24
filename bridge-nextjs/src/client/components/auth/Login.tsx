'use client';

import { useAuth } from '../../../client/hooks';

interface LoginProps {
  redirectUri?: string;
}

export function Login({ redirectUri }: LoginProps) {
  const { login } = useAuth();
  
  const handleLogin = () => {
    login({ redirectUri });
  };
  
  return (
    <button
      onClick={handleLogin}
      style={{
        display: 'inline-block',
        padding: '0.5rem 1rem',
        backgroundColor: '#3b82f6',
        color: 'white',
        borderRadius: '0.25rem',
        border: 'none',
        cursor: 'pointer'
      }}
    >
      Login with bridge
    </button>
  );
} 