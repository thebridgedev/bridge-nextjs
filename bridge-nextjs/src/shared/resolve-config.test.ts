/**
 * TBP-742 — config precedence and the hosted-pages address.
 *
 * Revert-proof: on origin/main the environment WON over explicit options in
 * both `getConfig()` (server) and `<BridgeProvider>` (client), and no hosted
 * URL was ever set, so a stage app's hosted sign-in opened on production.
 */
import { createBridgeConfig, hostedUrlFor, __resetConfigWarningsForTests } from './resolve-config';
import { getConfig } from '../server/utils/get-config';
import { resolveProviderConfig } from '../client/providers/bridge-provider';

jest.mock(
  'next/navigation',
  () => ({ useRouter: () => ({ push: jest.fn() }), usePathname: () => '/', useParams: () => ({}), notFound: jest.fn() }),
  { virtual: true },
);

const KEYS = [
  'NEXT_PUBLIC_BRIDGE_APP_ID',
  'NEXT_PUBLIC_BRIDGE_API_BASE_URL',
  'NEXT_PUBLIC_BRIDGE_HOSTED_URL',
  'NEXT_PUBLIC_BRIDGE_DEBUG',
  'NEXT_PUBLIC_BRIDGE_LOGIN_ROUTE',
  'NEXT_PUBLIC_BRIDGE_AUTH_BASE_URL',
] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  __resetConfigWarningsForTests();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  jest.restoreAllMocks();
});

describe('createBridgeConfig', () => {
  it('an explicit option wins over the environment, which wins over the default', () => {
    const env = { appId: 'env-app', apiBaseUrl: 'https://api-stage.thebridge.dev', debug: 'true' };
    const c = createBridgeConfig({ appId: 'explicit-app', debug: false }, { env, dev: false });
    expect(c.appId).toBe('explicit-app');
    expect(c.debug).toBe(false);
    expect(c.apiBaseUrl).toBe('https://api-stage.thebridge.dev');
  });

  it('an empty value counts as unset, on both sides', () => {
    const c = createBridgeConfig({ appId: '  ' }, { env: { appId: 'env-app', apiBaseUrl: '' }, dev: false });
    expect(c.appId).toBe('env-app');
    expect(c.apiBaseUrl).toBeUndefined();
  });

  it('reads the real NEXT_PUBLIC_BRIDGE_* variables', () => {
    process.env.NEXT_PUBLIC_BRIDGE_APP_ID = 'from-env';
    process.env.NEXT_PUBLIC_BRIDGE_API_BASE_URL = 'https://api-stage.thebridge.dev/';
    const c = createBridgeConfig({}, { dev: false });
    expect(c.appId).toBe('from-env');
    expect(c.apiBaseUrl).toBe('https://api-stage.thebridge.dev');
  });

  it('refuses to guess an app id, naming the variable', () => {
    expect(() => createBridgeConfig({}, { env: {}, dev: false })).toThrow(/NEXT_PUBLIC_BRIDGE_APP_ID/);
    expect(createBridgeConfig({}, { env: {}, requireAppId: false }).appId).toBeUndefined();
  });

  it("a stage app's hosted pages follow its API address", () => {
    const c = createBridgeConfig({}, { env: { appId: 'a', apiBaseUrl: 'https://api-stage.thebridge.dev' }, dev: false });
    expect(c.hostedUrl).toBe('https://auth-stage.thebridge.dev');
  });

  it('an explicit or env hosted URL wins over the derived one; a local API derives nothing', () => {
    expect(
      createBridgeConfig({}, { env: { appId: 'a', apiBaseUrl: 'http://localhost:3200', hostedUrl: 'http://localhost:3191' }, dev: false })
        .hostedUrl,
    ).toBe('http://localhost:3191');
    expect(createBridgeConfig({}, { env: { appId: 'a', apiBaseUrl: 'http://localhost:3200' }, dev: false }).hostedUrl).toBeUndefined();
    expect(
      createBridgeConfig({ hostedUrl: 'https://login.example.com' }, { env: { appId: 'a', apiBaseUrl: 'https://api-stage.thebridge.dev' }, dev: false })
        .hostedUrl,
    ).toBe('https://login.example.com');
  });

  it('warns once in development when a local API address has no hosted pages', () => {
    const warn = console.warn as jest.Mock;
    createBridgeConfig({}, { env: { appId: 'a', apiBaseUrl: 'http://localhost:3200' }, dev: true });
    createBridgeConfig({}, { env: { appId: 'a', apiBaseUrl: 'http://localhost:3200' }, dev: true });
    expect(warn.mock.calls.filter((c) => String(c[0]).includes('NEXT_PUBLIC_BRIDGE_HOSTED_URL'))).toHaveLength(1);
  });
});

describe('hostedUrlFor', () => {
  it('maps Bridge API hosts to their hosted pages only', () => {
    expect(hostedUrlFor('https://api.thebridge.dev')).toBe('https://auth.thebridge.dev');
    expect(hostedUrlFor('https://api-stage.thebridge.dev')).toBe('https://auth-stage.thebridge.dev');
    expect(hostedUrlFor('https://api.example.com')).toBeUndefined();
    expect(hostedUrlFor('not a url')).toBeUndefined();
  });
});

describe('getConfig (server) — explicit overrides win over the environment', () => {
  it('an override beats NEXT_PUBLIC_BRIDGE_APP_ID and the derived auth URL', () => {
    process.env.NEXT_PUBLIC_BRIDGE_APP_ID = 'env-app';
    process.env.NEXT_PUBLIC_BRIDGE_API_BASE_URL = 'https://api-stage.thebridge.dev';
    const c = getConfig({ appId: 'override-app', authBaseUrl: 'https://custom/auth' });
    expect(c.appId).toBe('override-app');
    expect(c.authBaseUrl).toBe('https://custom/auth');
    expect(c.apiBaseUrl).toBe('https://api-stage.thebridge.dev');
    expect(c.cloudViewsUrl).toBe('https://api-stage.thebridge.dev/cloud-views');
    expect(c.hostedUrl).toBe('https://auth-stage.thebridge.dev');
  });

  it('with no override the environment applies, then production defaults', () => {
    process.env.NEXT_PUBLIC_BRIDGE_APP_ID = 'env-app';
    const c = getConfig();
    expect(c.appId).toBe('env-app');
    expect(c.apiBaseUrl).toBe('https://api.thebridge.dev');
    expect(c.authBaseUrl).toBe('https://api.thebridge.dev/auth');
    expect(c.loginRoute).toBeUndefined();
  });
});

describe('resolveProviderConfig (client) — props win over the environment', () => {
  it('the appId prop and config fields beat NEXT_PUBLIC_BRIDGE_*', () => {
    process.env.NEXT_PUBLIC_BRIDGE_APP_ID = 'env-app';
    process.env.NEXT_PUBLIC_BRIDGE_LOGIN_ROUTE = '/env-login';
    process.env.NEXT_PUBLIC_BRIDGE_API_BASE_URL = 'https://api-stage.thebridge.dev';
    const c = resolveProviderConfig('prop-app', { loginRoute: '/auth/login' });
    expect(c.appId).toBe('prop-app');
    expect(c.loginRoute).toBe('/auth/login');
    expect(c.hostedUrl).toBe('https://auth-stage.thebridge.dev');
    expect(c.signupRoute).toBe('/auth/signup');
    expect(c.defaultRedirectRoute).toBe('/');
  });

  it('never throws without an app id (a server render must not crash)', () => {
    expect(resolveProviderConfig(undefined, undefined).appId).toBeUndefined();
  });
});
