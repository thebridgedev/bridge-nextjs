'use client';

import { useProfile } from '@nebulr-group/bridge-nextjs/client';

export default function ProtectedPage() {
  const { profile } = useProfile();

  return (
    
      <div style={{ 
        maxWidth: '800px', 
        margin: '0 auto', 
        padding: '2rem' 
      }}>
        <h1>Protected Page</h1>
        <p>This page is only accessible when you are logged in.</p>
        
        <div style={{ 
          marginTop: '2rem', 
          padding: '1rem', 
          backgroundColor: '#f8f9fa', 
          borderRadius: '0.5rem' 
        }}>
          <h2>Your Profile</h2>
          <p><strong>Name:</strong> {profile?.fullName}</p>
          <p><strong>Email:</strong> {profile?.email}</p>
          <p><strong>Username:</strong> {profile?.username}</p>
          {profile?.tenant && (
            <div style={{ marginTop: '1rem' }}>
              <h3>Tenant Information</h3>
              <p><strong>Tenant Name:</strong> {profile.tenant.name}</p>
              <p><strong>Tenant ID:</strong> {profile.tenant.id}</p>
            </div>
          )}
        </div>
      </div>    
  );
} 