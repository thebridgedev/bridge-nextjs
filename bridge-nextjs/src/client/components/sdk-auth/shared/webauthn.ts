/**
 * TBP-742 / TBP-515 — the browser half of a passkey ceremony.
 *
 * auth-core fetches the options and verifies the result; the browser prompt in
 * between is `@simplewebauthn/browser` (a regular dependency, the S3 decision
 * bridge-svelte made). Before this, bridge-nextjs called
 * `authenticateWithPasskey()` with no browser response and a
 * `registerPasskeyWithToken()` auth-core does not have, so neither passkey
 * sign-in nor passkey setup could succeed.
 *
 * `window.__simpleWebAuthn` is the same seam bridge-svelte's e2e suite uses to
 * stand in a virtual authenticator; apps never set it.
 */
type SimpleWebAuthn = {
  startAuthentication: (opts: { optionsJSON: unknown; useBrowserAutofill?: boolean }) => Promise<unknown>;
  startRegistration: (opts: { optionsJSON: unknown }) => Promise<unknown>;
};

async function simpleWebAuthn(): Promise<SimpleWebAuthn> {
  const override = typeof window !== 'undefined' ? (window as { __simpleWebAuthn?: SimpleWebAuthn }).__simpleWebAuthn : undefined;
  if (override && typeof override.startAuthentication === 'function') return override;
  return (await import('@simplewebauthn/browser')) as unknown as SimpleWebAuthn;
}

/** True when this browser can run a passkey ceremony at all. */
export function passkeysSupported(): boolean {
  return typeof window !== 'undefined' && !!(window as { PublicKeyCredential?: unknown }).PublicKeyCredential;
}

/** Ask the browser for an assertion for the server's authentication options. */
export async function startPasskeyAuthentication(options: unknown, autofill = false): Promise<unknown> {
  return (await simpleWebAuthn()).startAuthentication({ optionsJSON: options, useBrowserAutofill: autofill });
}

/** Ask the browser to create a credential for the server's registration options. */
export async function startPasskeyRegistration(options: unknown): Promise<unknown> {
  return (await simpleWebAuthn()).startRegistration({ optionsJSON: options });
}
