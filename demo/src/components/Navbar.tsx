'use client';

import { useAuth, useProfile } from '@nebulr-group/bridge-nextjs/client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import '../app/globals.css';

export default function Navbar() {
  const { isAuthenticated, isLoading: authLoading, logout } = useAuth();
  const { profile, isLoading: profileLoading } = useProfile();
  const router = useRouter();

  const isLoading = authLoading || profileLoading;
  
  const handleLogout = async () => {
    // Await the auth-core logout (clears tokens, fires auth:logout, resets store)
    // before navigating, so the unauthenticated nav state is in place by the
    // time we land on `/`.
    await logout();
    router.push('/');
  };
  
  return (
    <nav className="nav-menu">
      <div className="nav-container">
        <Link href="/" className="nav-brand">
          bridge Demo
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
            
            <Link href="/team-panel" className="nav-link">
              Team Management
            </Link>

            <Link href="/subscription" className="nav-link">
              Subscription
            </Link>

            <Link href="/workspaces" className="nav-link">
              Workspaces
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
            <Link href="/auth/login" className="nav-link nav-link--login">
              Login
            </Link>
            <Link href="/protected" className="nav-link">
              Protected Page
            </Link>
          </div>
        )}
      </div>
    </nav>
  );
} 