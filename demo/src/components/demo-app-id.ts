/**
 * Runtime app-id override for the demo — the Next.js counterpart of
 * bridge-svelte's `localStorage['bridge:appId']` (see its `+layout.ts`).
 *
 * The E2E harness resolves the app id from the test-data API at run time and
 * seeds it into the browser's localStorage under this key, so the demo does not
 * depend on an env file carrying an id that only exists after pre-setup ran —
 * and so each Playwright worker can drive its own Bridge app (TBP-721).
 *
 * Precedence: `NEXT_PUBLIC_BRIDGE_APP_ID` still wins when it is set, because
 * `BridgeProvider` merges env config over props. The test env files therefore
 * leave it EMPTY; a developer's `npm run dev` (config/.env.local) keeps using
 * the env var exactly as before.
 *
 * Client-only by nature: the server render has no localStorage and never
 * initializes the SDK anyway (BridgeProvider inits on the client).
 */
export const APP_ID_STORAGE_KEY = 'bridge:appId';

export function readStoredAppId(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const value = window.localStorage.getItem(APP_ID_STORAGE_KEY);
    return value?.trim() || undefined;
  } catch {
    // localStorage disabled — fall back to the env var
    return undefined;
  }
}
