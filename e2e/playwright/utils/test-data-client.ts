import type { EnvironmentConfig } from '../config/environments';

export interface PlaywrightTestAccount {
  email: string;
  password: string;
  userId: string;
  tenantId: string;
  appId: string;
}

export interface CreateTestAccountOptions {
  email?: string;
  password?: string;
  tenantName?: string;
  firstName?: string;
  lastName?: string;
}

export class TestDataClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly appDomain: string;

  constructor(config: EnvironmentConfig) {
    this.baseUrl = config.testDataApiUrl;
    this.apiKey = config.testDataApiKey;
    this.appDomain = config.appDomain;
  }

  async createTestAccount(options?: CreateTestAccountOptions): Promise<PlaywrightTestAccount> {
    const response = await fetch(`${this.baseUrl}/account/test/playwright/account`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-playwright-api-key': this.apiKey,
      },
      body: JSON.stringify({
        appDomain: this.appDomain,
        ...options,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to create test account: ${response.status} ${error}`);
    }

    return response.json();
  }

  async removeTestAccount(email: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/account/test/playwright/account`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'x-playwright-api-key': this.apiKey,
      },
      body: JSON.stringify({
        email,
        appDomain: this.appDomain,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to remove test account: ${response.status} ${error}`);
    }
  }

  async healthCheck(): Promise<{ success: boolean; diagnostics?: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/account/test/playwright/health`, {
        method: 'GET',
        headers: { 'x-playwright-api-key': this.apiKey },
      });

      const responseText = await response.text();
      let responseBody: unknown;
      try {
        responseBody = JSON.parse(responseText);
      } catch {
        responseBody = responseText;
      }

      if (!response.ok) {
        return {
          success: false,
          diagnostics: `Health check failed: ${response.status} ${response.statusText} | ${JSON.stringify(responseBody)}`,
        };
      }
      return { success: true };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        diagnostics: `Health check error: ${message} | URL: ${this.baseUrl}/account/test/playwright/health`,
      };
    }
  }

  async setupTestApp(
    domain: string,
    appName: string,
    ownerEmail: string,
    ownerPassword?: string,
    appUrl?: string
  ): Promise<{
    appId: string;
    domain: string;
    tenantId: string;
    userId: string;
    email: string;
    message: string;
  }> {
    const response = await fetch(`${this.baseUrl}/account/test/playwright/setup-test-app`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-playwright-api-key': this.apiKey,
      },
      body: JSON.stringify({
        domain,
        appName,
        ownerEmail,
        ownerPassword,
        appUrl,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to setup test app: ${response.status} ${error}`);
    }

    return response.json();
  }

  async purgeTestAccounts(): Promise<number> {
    const response = await fetch(`${this.baseUrl}/account/test/playwright/purge`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-playwright-api-key': this.apiKey,
      },
      body: JSON.stringify({ appDomain: this.appDomain }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to purge test accounts: ${response.status} ${error}`);
    }

    const result = (await response.json()) as { purgedCount?: number };
    return result.purgedCount ?? 0;
  }
}

export function createTestDataClientFromEnv(): TestDataClient {
  const projectName = process.env.PLAYWRIGHT_PROJECT_NAME || '';
  let testDataApiUrl: string;
  if (projectName.includes('prod')) {
    testDataApiUrl = process.env.PROD_TEST_DATA_API_URL || '';
  } else if (projectName.includes('stage')) {
    testDataApiUrl = process.env.STAGE_TEST_DATA_API_URL || '';
  } else {
    testDataApiUrl = process.env.LOCAL_TEST_DATA_API_URL || 'http://localhost:3200';
  }

  const testDataApiKey = process.env.PLAYWRIGHT_TEST_API_KEY;
  const appDomain = process.env.APP_DOMAIN || 'BRIDGE_NEXTJS_TEST_DASHBOARD';

  if (!testDataApiKey) {
    throw new Error('PLAYWRIGHT_TEST_API_KEY environment variable is required');
  }

  return new TestDataClient({
    name: 'local',
    baseUrl: '',
    testDataApiUrl,
    testDataApiKey,
    appId: process.env.BRIDGE_TEST_APP_ID || '',
    appDomain,
    isContainer: false,
  });
}
