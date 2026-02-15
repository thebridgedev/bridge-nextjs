import { logger } from '../logger';
import type { BridgeConfig } from '../types/config';

/**
 * Redirects the user to Bridge's plan selection page.
 * Uses the handover protocol: exchanges the access token for a short-lived handover code,
 * then redirects to cloud-views subscription portal.
 *
 * Must be called in the browser with a valid config and access token.
 *
 * @param config - Bridge config (must include appId, authBaseUrl, cloudViewsUrl)
 * @param accessToken - Current user access token
 */
export async function redirectToPlanSelection(
  config: BridgeConfig,
  accessToken: string
): Promise<void> {
  if (typeof window === 'undefined') {
    throw new Error('Plan redirects are only available in the browser');
  }

  const authBaseUrl = config.authBaseUrl || 'https://api.thebridge.dev/auth';
  const cloudViewsUrl = config.cloudViewsUrl || 'https://api.thebridge.dev/cloud-views';
  const appId = config.appId;

  if (!appId) {
    throw new Error('appId is required for plan redirect');
  }
  if (!accessToken) {
    throw new Error('No access token available. Please log in first.');
  }

  try {
    const handoverResponse = await fetch(`${authBaseUrl}/handover/code/${appId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        accessToken,
        redirectUri: config.callbackUrl || `${window.location.origin}/auth/oauth-callback`,
      }),
    });

    if (!handoverResponse.ok) {
      throw new Error(`Failed to get handover code: ${handoverResponse.statusText}`);
    }

    const { code } = await handoverResponse.json();

    if (!code) {
      throw new Error('Handover response did not contain a code');
    }

    const redirectUrl = `${cloudViewsUrl}/subscription-portal/selectPlan?code=${code}`;
    logger.debug('[plan] Redirecting to plan selection via handover', redirectUrl);
    window.location.href = redirectUrl;
  } catch (error) {
    logger.error('[plan] Failed to redirect to plan selection', error);
    throw error;
  }
}

export const planService = {
  redirectToPlanSelection,
};
