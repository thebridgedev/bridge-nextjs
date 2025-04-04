'use client';

import { ReactNode, useEffect } from 'react';
import { AuthService } from '../services/auth.service';
import { NblocksConfig } from '../types/config';

interface NblocksProviderProps {
  config: NblocksConfig;
  children: ReactNode;
}

export function NblocksProvider({ config, children }: NblocksProviderProps) {
  // Initialize auth service with config
  useEffect(() => {
    AuthService.getInstance(config);
  }, [config]);
  
  return <>{children}</>;
} 