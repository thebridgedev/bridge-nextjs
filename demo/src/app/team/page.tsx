'use client';

import { Team } from 'nblocks-nextjs/client';

export default function TeamPage() {
  return (
    <div style={{ 
      maxWidth: '1200px', 
      margin: '0 auto', 
      padding: '2rem' 
    }}>
      <h1>Team Management</h1>
      <p>This page demonstrates the Team component from nblocks-nextjs.</p>
      
      <div style={{ 
        marginTop: '2rem',
        border: '1px solid #e0e0e0',
        borderRadius: '0.5rem',
        overflow: 'hidden'
      }}>
        <Team />
      </div>
    </div>
  );
} 