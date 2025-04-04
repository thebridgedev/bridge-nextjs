'use client';

import { AuthService } from '../services/auth.service';
import { NblocksConfig } from '../types/config';

/**
 * Handles the OAuth callback by exchanging the authorization code for tokens
 * @param code The authorization code from the URL
 * @param config Optional nBlocks configuration
 * @returns A promise that resolves when the callback is complete
 */
export async function handleCallback(code: string, config?: NblocksConfig): Promise<void> {
  if (!code) {
    throw new Error('No authorization code provided');
  }
  
  const authService = AuthService.getInstance(config);
  await authService.handleCallback(code);
}

/**
 * Extracts the authorization code from the URL
 * @returns The authorization code or null if not found
 */
export function getCodeFromUrl(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }
  
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get('code');
}

/**
 * Handles the OAuth callback by extracting the code from the URL and exchanging it for tokens
 * @param config Optional nBlocks configuration
 * @returns A promise that resolves when the callback is complete
 */
export async function handleCallbackFromUrl(config?: NblocksConfig): Promise<void> {
  const code = getCodeFromUrl();
  if (!code) {
    throw new Error('No authorization code found in URL');
  }
  
  await handleCallback(code, config);
} 