'use client';

import { Login, useAuth, useProfile } from '@nebulr-group/nblocks-nextjs/client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import '../app/globals.css';

export default function Navbar() {
  const { isAuthenticated, isLoading: authLoading, logout } = useAuth();
  const { profile, isLoading: profileLoading } = useProfile();
  const router = useRouter();

  const isLoading = authLoading || profileLoading;
  
  const handleLogout = () => {
    logout();
    // Redirect to main page after logout
    router.push('/');
  };
  
  return (
    <nav className="nav-menu">
      <div className="nav-container">
        <Link href="/" className="nav-brand">
          nBlocks Demo
        </Link>
        
        {isLoading ? (
          <div className="nav-loading" />
        ) : isAuthenticated ? (
          <div className="nav-links">
            {profile?.username && (
              <span className="nav-greeting">
                Welcome back, {profile.username}
              </span>
            )}
            
            <Link href="/" className="nav-link" style={{ marginRight: 'auto' }}>
              Home
            </Link>
            
            <Link href="/team" className="nav-link">
              Team Management
            </Link>
            
            <Link href="/protected" className="nav-link">
              Protected Page
            </Link>
            
            <button onClick={handleLogout} className="nav-button">
              Logout
            </button>
          </div>
        ) : (
          <div className="nav-links">
            <div className="nav-login">
              <Login />
            </div>
            <Link href="/protected" className="nav-link">
              Protected Page
            </Link>
          </div>
        )}
      </div>
    </nav>
  );
} 