/**
 * Environment configuration for bridge-nextjs Playwright E2E tests.
 * Loaded from config/.env.test.local (see playwright.config.ts).
 */

export interface EnvironmentConfig {
  baseUrl: string;
  /** auth-core root the demo talks to (no /auth or /cloud-views suffix). */
  apiBaseUrl: string;
  authBaseUrl?: string;
  cloudViewsUrl?: string;
  testDataApiUrl: string;
  testDataApiKey: string;
  appId: string;
  appDomain: string;
  name: 'local' | 'stage' | 'prod';
  isContainer: boolean;
}

/**
 * Public, fixed endpoints for the hosted environments. Defaults rather than
 * required settings so a clean checkout can run the stage/prod suites without
 * uncommenting anything (TBP-721, mirrors bridge-svelte TBP-606). Override via
 * STAGE_* / PROD_* only to point the suite at a different backend.
 */
export const DEFAULT_STAGE_API_BASE_URL = 'https://api-stage.thebridge.dev';
export const DEFAULT_PROD_API_BASE_URL = 'https://api.thebridge.dev';
export const DEFAULT_LOCAL_API_BASE_URL = 'http://localhost:3200';

/** The demo harness port — must match playwright.config.ts's webServer. */
export const DEFAULT_DEMO_BASE_URL = 'http://localhost:3010';

/**
 * The API root the DEMO must be talking to for a given environment. global-setup
 * asserts the running demo against this, so the boundary between "the backend the
 * test-data client provisions on" and "the backend the browser drives" cannot
 * silently diverge again (TBP-721: the stage suite drove the browser at the local
 * API).
 */
export function expectedDemoApiBaseUrl(environment: 'local' | 'stage' | 'prod'): string {
  switch (environment) {
    case 'stage':
      return (process.env.STAGE_API_BASE_URL || DEFAULT_STAGE_API_BASE_URL).replace(/\/$/, '');
    case 'prod':
      return (process.env.PROD_API_BASE_URL || DEFAULT_PROD_API_BASE_URL).replace(/\/$/, '');
    default:
      return (
        process.env.LOCAL_API_BASE_URL ||
        process.env.LOCAL_TEST_DATA_API_URL ||
        DEFAULT_LOCAL_API_BASE_URL
      ).replace(/\/$/, '');
  }
}

function isRunningInContainer(): boolean {
  if (process.env.DOCKER === 'true' || process.env.IN_DOCKER === 'true') return true;
  try {
    require('fs').accessSync('/.dockerenv');
    return true;
  } catch {
    return false;
  }
}

function getServiceUrl(
  serviceName: string,
  containerPort: number,
  hostPort: number,
  isContainer: boolean
): string {
  if (isContainer) return `http://${serviceName}:${containerPort}`;
  return `http://localhost:${hostPort}`;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Required environment variable ${name} is not set. Check config/.env.test.local or CI secrets.`
    );
  }
  return value;
}

export function getEnvironmentConfig(environment: 'local' | 'stage' | 'prod'): EnvironmentConfig {
  const testDataApiKey = requireEnv('PLAYWRIGHT_TEST_API_KEY');
  const appDomain = process.env.APP_DOMAIN || 'BRIDGE_NEXTJS_TEST_DASHBOARD';
  const isContainer = isRunningInContainer();

  const baseUrl = isContainer
    ? getServiceUrl('bridge-nextjs', 3001, 3001, isContainer)
    : process.env.LOCAL_BASE_URL || DEFAULT_DEMO_BASE_URL;

  const appId = requireEnv('BRIDGE_TEST_APP_ID');

  switch (environment) {
    case 'local': {
      const authBaseUrl = isContainer
        ? getServiceUrl('bridge-api', 3000, 3200, isContainer) + '/auth'
        : process.env.LOCAL_AUTH_BASE_URL || 'http://localhost:3200/auth';
      const cloudViewsUrl = isContainer
        ? getServiceUrl('bridge-cloud-views', 3000, 3091, isContainer)
        : process.env.LOCAL_CLOUD_VIEWS_URL || 'http://localhost:3200/cloud-views';
      const testDataApiUrl = isContainer
        ? getServiceUrl('bridge-api', 3000, 3200, isContainer)
        : process.env.LOCAL_TEST_DATA_API_URL || 'http://localhost:3200';
      // apiBaseUrl is the auth-core root (without /auth or /cloud-views).
      // Subscription / feature-flag specs use it as the base for `page.route(...)` mocks.
      const apiBaseUrl = isContainer
        ? getServiceUrl('bridge-api', 3000, 3200, isContainer)
        : expectedDemoApiBaseUrl('local');

      return {
        name: 'local',
        baseUrl,
        apiBaseUrl,
        authBaseUrl,
        cloudViewsUrl,
        testDataApiUrl,
        testDataApiKey,
        appId,
        appDomain,
        isContainer,
      };
    }
    case 'stage':
      return {
        name: 'stage',
        baseUrl,
        apiBaseUrl: expectedDemoApiBaseUrl('stage'),
        authBaseUrl: process.env.STAGE_AUTH_BASE_URL,
        cloudViewsUrl: process.env.STAGE_CLOUD_VIEWS_URL,
        testDataApiUrl: process.env.STAGE_TEST_DATA_API_URL || DEFAULT_STAGE_API_BASE_URL,
        testDataApiKey,
        appId,
        appDomain,
        isContainer: false,
      };
    case 'prod':
      return {
        name: 'prod',
        baseUrl,
        apiBaseUrl: expectedDemoApiBaseUrl('prod'),
        testDataApiUrl: process.env.PROD_TEST_DATA_API_URL || DEFAULT_PROD_API_BASE_URL,
        testDataApiKey,
        appId,
        appDomain,
        isContainer: false,
      };
  }
}

export function getCurrentEnvironment(): 'local' | 'stage' | 'prod' {
  const projectName = process.env.PLAYWRIGHT_PROJECT_NAME || '';
  if (projectName.includes('prod')) return 'prod';
  if (projectName.includes('stage')) return 'stage';
  return 'local';
}
