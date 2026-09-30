// TBP-742 — Bridge starts from one line with no arguments, on Next.js too.
//
// Mirrors bridge-svelte's `resolve-config.ts` (TBP-695). Two defects it removes:
//
//   1. Environment variables used to WIN over explicit options, in the provider
//      (`bridge-provider.tsx`) and in `getConfig()`. A developer who passed
//      `appId` to `<BridgeProvider>` to point one page at another app got the
//      env value instead, silently. The documented rule everywhere else in
//      Bridge is *explicit option > environment > default*.
//   2. Nothing set the hosted-pages address, so a stage app that set only its
//      API address (the documented shape) still sent sign-in to PRODUCTION's
//      hosted pages, where its app id does not exist.
//
// Isomorphic on purpose: no 'use client', no next/* import. The provider (client),
// the middleware (edge) and route handlers (node) all resolve through here, so
// they cannot disagree about which app and which environment they talk to.

import type { BridgeConfig } from './types/config';

/** Where Bridge's production API lives — the default when no address is set. */
export const PRODUCTION_API_BASE_URL = 'https://api.thebridge.dev';

/** The standard `NEXT_PUBLIC_BRIDGE_*` variables, already mapped to config fields. */
export interface BridgeEnv {
  appId?: string;
  apiBaseUrl?: string;
  hostedUrl?: string;
  callbackUrl?: string;
  defaultRedirectRoute?: string;
  loginRoute?: string;
  signupRoute?: string;
  debug?: string;
}

/**
 * Read the `NEXT_PUBLIC_BRIDGE_*` variables.
 *
 * Every access is a literal `process.env.NEXT_PUBLIC_…` property read on
 * purpose: that is the form Next.js inlines into the browser bundle, including
 * in a library consumed from node_modules. A dynamic key (`process.env[name]`)
 * is not inlined and reads `undefined` in the browser.
 */
export function readBridgeEnv(): BridgeEnv {
  try {
    return {
      appId: process.env.NEXT_PUBLIC_BRIDGE_APP_ID,
      apiBaseUrl: process.env.NEXT_PUBLIC_BRIDGE_API_BASE_URL,
      hostedUrl: process.env.NEXT_PUBLIC_BRIDGE_HOSTED_URL,
      callbackUrl: process.env.NEXT_PUBLIC_BRIDGE_CALLBACK_URL,
      defaultRedirectRoute: process.env.NEXT_PUBLIC_BRIDGE_DEFAULT_REDIRECT_ROUTE,
      loginRoute: process.env.NEXT_PUBLIC_BRIDGE_LOGIN_ROUTE,
      signupRoute: process.env.NEXT_PUBLIC_BRIDGE_SIGNUP_ROUTE,
      debug: process.env.NEXT_PUBLIC_BRIDGE_DEBUG,
    };
  } catch {
    // A bundler with no `process` at all.
    return {};
  }
}

/**
 * The hosted pages for an API address on Bridge's own domains: `api` becomes
 * `auth`, so `api-stage.thebridge.dev` pairs with `auth-stage.thebridge.dev`.
 * Any other host (localhost, self-hosted) cannot be derived.
 */
export function hostedUrlFor(apiBaseUrl: string): string | undefined {
  try {
    const url = new URL(apiBaseUrl);
    const match = /^api(-[a-z0-9-]+)?\.thebridge\.dev$/.exec(url.hostname);
    return match ? `https://auth${match[1] ?? ''}.thebridge.dev` : undefined;
  } catch {
    return undefined;
  }
}

function isDevBuild(): boolean {
  try {
    return process.env.NODE_ENV !== 'production';
  } catch {
    return false;
  }
}

// An empty variable means "not set": `KEY=` in a .env file loads as '', and the
// demo's tracked env files use exactly that. '' must never count as a value.
function present(value: string | undefined | null): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

/** Options for {@link createBridgeConfig}. */
export interface CreateBridgeConfigOptions {
  /** The environment to read. Defaults to the real `NEXT_PUBLIC_BRIDGE_*` variables. */
  env?: BridgeEnv;
  /** Development build? Controls the one-time warnings. Defaults to `NODE_ENV !== 'production'`. */
  dev?: boolean;
  /**
   * `false` returns a config without an app id instead of throwing. For the
   * provider, which must not crash a server render; everything else wants the
   * throw.
   * @default true
   */
  requireAppId?: boolean;
}

const warned = new Set<string>();
function warnOnce(key: string, message: string): void {
  if (warned.has(key)) return;
  warned.add(key);
  // eslint-disable-next-line no-console
  console.warn(message);
}

/** Test hook: let the warnings print again. */
export function __resetConfigWarningsForTests(): void {
  warned.clear();
}

/**
 * The effective Bridge config: an option passed explicitly wins over the
 * environment, and the environment wins over the built-in default. An empty
 * value counts as unset.
 *
 * The hosted-pages address follows the API address on Bridge's own domains
 * (`api-stage.thebridge.dev` → `auth-stage.thebridge.dev`), so one variable is
 * enough for a stage app. `NEXT_PUBLIC_BRIDGE_HOSTED_URL` (or `hostedUrl`) is
 * only for a local or self-hosted Bridge.
 *
 * Refuses to guess: with no app id anywhere it throws, naming the variable to
 * set. An app id with no API address runs against production — the documented
 * shape of a production app — and in development it says so once.
 *
 * @example
 * ```tsx
 * // app/layout.tsx — a Server Component; the config is plain data
 * <BridgeProvider config={createBridgeConfig({ billing: { paywallRoute: '/welcome' } })}>
 * ```
 * `<BridgeProvider>` resolves its `config` prop through this same function, so
 * passing the options straight to the provider is equivalent.
 */
export function createBridgeConfig(
  options: Partial<BridgeConfig> = {},
  resolveOptions: CreateBridgeConfigOptions = {},
): BridgeConfig {
  const env = resolveOptions.env ?? readBridgeEnv();
  const dev = resolveOptions.dev ?? isDevBuild();

  const appId = present(options.appId) ?? present(env.appId);
  if (!appId && resolveOptions.requireAppId !== false) {
    throw new Error(
      '[bridge] No Bridge app id was found. Set NEXT_PUBLIC_BRIDGE_APP_ID in your .env ' +
        '(plus NEXT_PUBLIC_BRIDGE_API_BASE_URL for a stage or local app), ' +
        'or pass { appId } to <BridgeProvider>.',
    );
  }

  const apiBaseUrl = present(options.apiBaseUrl) ?? present(env.apiBaseUrl);
  const hostedUrl =
    present(options.hostedUrl) ??
    present(env.hostedUrl) ??
    (apiBaseUrl ? hostedUrlFor(apiBaseUrl) : undefined);

  const envDebug = present(env.debug);
  const debug = options.debug ?? (envDebug === undefined ? undefined : envDebug === 'true');

  if (appId && !apiBaseUrl && dev) {
    warnOnce(
      'api',
      `[bridge] NEXT_PUBLIC_BRIDGE_API_BASE_URL is not set, so app ${appId} is using production ` +
        `(${PRODUCTION_API_BASE_URL}). Set it if this is a stage or local app.`,
    );
  }
  if (apiBaseUrl && !hostedUrl && dev) {
    warnOnce(
      'hosted',
      `[bridge] NEXT_PUBLIC_BRIDGE_HOSTED_URL is not set and cannot be derived from ${apiBaseUrl}, ` +
        `so hosted sign-in pages will open on production. Set it to this environment's hosted pages.`,
    );
  }

  const resolved: BridgeConfig = { ...options, appId: appId as string };
  if (!appId) delete (resolved as Partial<BridgeConfig>).appId;

  const pick = <K extends 'callbackUrl' | 'defaultRedirectRoute' | 'loginRoute' | 'signupRoute'>(key: K) => {
    const value = present(options[key] as string | undefined) ?? present(env[key]);
    if (value) resolved[key] = value as BridgeConfig[K];
    else delete resolved[key];
  };

  if (apiBaseUrl) resolved.apiBaseUrl = apiBaseUrl.replace(/\/+$/, '');
  else delete resolved.apiBaseUrl;
  if (hostedUrl) resolved.hostedUrl = hostedUrl.replace(/\/+$/, '');
  else delete resolved.hostedUrl;
  pick('callbackUrl');
  pick('defaultRedirectRoute');
  pick('loginRoute');
  pick('signupRoute');
  if (debug !== undefined) resolved.debug = debug;
  else delete resolved.debug;
  return resolved;
}
