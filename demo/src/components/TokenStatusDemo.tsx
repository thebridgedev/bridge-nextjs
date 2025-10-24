'use client';

import { TokenStatus, useAuth } from 'nblocks-nextjs/client';
import Link from 'next/link';

export function TokenStatusDemo() {
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="token-status-demo">
      <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '1rem' }}>Token Renewal Demo</h2>
      <p style={{ marginBottom: '1.5rem' }}>
        This demo showcases the token renewal functionality. The token status component below
        shows the current token expiry time and renewal status.
      </p>
      <div style={{ 
        backgroundColor: '#f9fafb', 
        borderRadius: '0.5rem', 
        padding: '1.5rem', 
        marginBottom: '1.5rem',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
      }}>
        <TokenStatus />
      </div>
      <div style={{ 
        backgroundColor: '#f9fafb', 
        borderRadius: '0.5rem', 
        padding: '1.5rem',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
      }}>
        <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '1rem' }}>How it works</h3>
        <ul style={{ listStyleType: 'disc', paddingLeft: '1.5rem' }}>
          <li style={{ marginBottom: '0.5rem' }}>
            <strong>Client-side renewal:</strong> The token is automatically renewed when it's close to expiring.
            This is handled by the <code style={{ 
              backgroundColor: '#f1f5f9', 
              padding: '0.2rem 0.4rem', 
              borderRadius: '0.25rem', 
              fontFamily: 'monospace' 
            }}>TokenService</code> which monitors token expiry and refreshes when needed.
          </li>
          <li style={{ marginBottom: '0.5rem' }}>
            <strong>Server-side renewal:</strong> The middleware checks token validity on each request and
            refreshes the token if needed before the request is processed.
          </li>
          <li style={{ marginBottom: '0.5rem' }}>
            <strong>Manual renewal:</strong> You can manually refresh the token by clicking the "Refresh Token" button.
          </li>
        </ul>
      </div>
      <div style={{ marginTop: '1.5rem', display: 'flex', gap: '1rem' }}>
        <Link 
          href="/protected" 
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: '#3b82f6',
            color: 'white',
            borderRadius: '0.25rem',
            textDecoration: 'none'
          }}
        >
          Protected Page
        </Link>
        <Link 
          href="/team" 
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: '#10b981',
            color: 'white',
            borderRadius: '0.25rem',
            textDecoration: 'none'
          }}
        >
          Team Management
        </Link>
      </div>
    </div>
  );
} 