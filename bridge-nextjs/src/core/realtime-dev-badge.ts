// TBP-644 — decision logic for the development-only "Live updates off — why?"
// badge. Framework-free so it is unit-testable and shared in shape with the
// other Bridge SDKs; the component is a thin view over it.

import type { RealtimeStatus } from '@nebulr-group/bridge-auth-core';

/** A connection still retrying after this long is worth telling the developer about. */
export const REALTIME_BADGE_RETRYING_AFTER_MS = 30_000;

/**
 * Used when a status carries a reason but no docs link (e.g. `degraded`).
 * Mirrors auth-core's REALTIME_DOCS_BASE_URL — not imported, so a consumer on
 * an auth-core that predates it does not fail to build.
 */
const DOCS_BASE_URL = 'https://thebridge.dev/docs/live-updates/troubleshooting/';

/**
 * True in development builds. Bundlers (Vite, webpack, Next, Rollup with
 * replace) substitute `process.env.NODE_ENV` TEXTUALLY — keep this exact
 * expression, and do not guard it with `typeof process`, which bundlers leave
 * alone and which is `'undefined'` in the browser. Where nothing substituted
 * it and there is no `process`, the badge stays off: a production app must
 * never show it.
 */
export function isDevBuild(): boolean {
  try {
    return process.env.NODE_ENV !== 'production';
  } catch {
    return false;
  }
}

export interface RealtimeBadgeView {
  /** Machine-readable reason — also the docs anchor. */
  reason: string;
  /** Plain-language owner of the fault. */
  sideLabel: string;
  docsUrl?: string;
  ref?: string;
  /**
   * Identity of this run of trouble. Dismissing hides the badge until the key
   * changes, so a NEW problem shows again but the same one does not nag.
   */
  key: string;
}

const SIDE_LABELS: Record<NonNullable<RealtimeStatus['side']>, string> = {
  app: 'Your app — the session / token it hands to Bridge',
  config: "Your Bridge settings — apiBaseUrl or appId don't match the session",
  bridge: 'Bridge — nothing to change in your app',
  network: 'The network — retrying automatically',
};

function sideLabel(status: RealtimeStatus): string {
  if (status.side) return SIDE_LABELS[status.side];
  if (status.state === 'degraded') return 'Channel access — connected, but Bridge accepted no channel';
  return 'Unknown';
}

/**
 * Tracks when the current retrying run started. `RealtimeStatus.since` resets
 * on every state flip (closed ↔ connecting), so it cannot measure how long a
 * retry loop has lasted; the episode `ref` stays constant for the whole run.
 */
export function createRetryClock(): (status: RealtimeStatus, now: number) => number | undefined {
  let ref: string | undefined;
  let since: number | undefined;
  return (status, now) => {
    if (!status.retrying) {
      ref = undefined;
      since = undefined;
      return undefined;
    }
    const key = status.ref ?? '';
    if (since === undefined || key !== ref) {
      ref = key;
      since = now;
    }
    return since;
  };
}

/**
 * What the badge should say, or null when live updates are fine. Shown while
 * the client has given up (`unauthorized`), is connected but deaf
 * (`degraded`), or has been retrying for longer than
 * {@link REALTIME_BADGE_RETRYING_AFTER_MS}.
 */
export function realtimeBadgeView(
  status: RealtimeStatus,
  retryingSince: number | undefined,
  now: number,
): RealtimeBadgeView | null {
  const stuck = status.state === 'unauthorized' || status.state === 'degraded';
  const retryingTooLong =
    status.retrying && retryingSince !== undefined && now - retryingSince >= REALTIME_BADGE_RETRYING_AFTER_MS;
  if (!stuck && !retryingTooLong) return null;
  const reason = status.reason ?? status.state;
  return {
    reason,
    sideLabel: sideLabel(status),
    docsUrl: status.docsUrl ?? (status.reason ? `${DOCS_BASE_URL}#${status.reason}` : undefined),
    ref: status.ref,
    key: `${stuck ? status.state : 'retrying'}|${reason}|${status.ref ?? ''}`,
  };
}
