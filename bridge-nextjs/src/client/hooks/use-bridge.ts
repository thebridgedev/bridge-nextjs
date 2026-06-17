'use client';

/**
 * Live Channel Unification (TBP-288/320) — `useBridge()` hook.
 *
 * Ported from bridge-svelte's `core/use-bridge.ts`. Svelte's version reads from
 * Svelte context with a singleton fallback; React has no equivalent ambient
 * context for the bridge surface, so this hook returns the module-level
 * singleton `bridge` (per the §5.4 export map: "functions/surface on the
 * singleton"). The object identity is stable, so returning it from a hook is
 * render-safe.
 *
 * Naming note: auth-core also exports a `useBridge` (the billing/quota factory).
 * bridge-nextjs's `useBridge()` is the unified read surface; consumers who want
 * the auth-core factory should import it directly from
 * `@nebulr-group/bridge-auth-core` as `useBridge` (aliased there).
 */
import { bridge, type BridgeSurface } from '../../core/bridge';

/**
 * Return the unified bridge surface (`bridge.app` / `bridge.tenant` /
 * `bridge.user` / `bridge.attributes` / `bridge.events`). Safe to call from any
 * component or plain module.
 */
export function useBridge(): BridgeSurface {
  return bridge;
}
