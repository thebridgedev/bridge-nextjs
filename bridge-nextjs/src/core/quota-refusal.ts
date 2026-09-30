/**
 * TBP-742 (port of bridge-svelte TBP-703) — "your backend refused this because a
 * plan limit is reached", as an event the app never has to wire.
 *
 * A backend guarded by `@RequireQuota` (bridge-nestjs) answers a request made at
 * the plan's cap with:
 *
 *   402 { statusCode: 402, code: 'QUOTA_EXCEEDED', message, metric, used, limit, fix }
 *
 * Every 402 that `bridgeFetch()` — or the page-wide observer `<BridgeProvider>`
 * installs on `window.fetch` for the page's origin, Bridge's API and
 * `billing.apiOrigins` — sees is handed to `observeQuotaRefusal()`. A matching
 * body becomes a `BridgeQuotaRefusal`: `<BridgeProvider>` shows it in
 * `<BridgeUpgradeDialog>` (on by default), and `onBridgeQuotaExceeded()` hands
 * it to anything else that wants it. The caller still gets its response
 * untouched and at once: the body is read from a clone, after the fact.
 *
 * The dialog is decoration. The refusal is the backend's; this only explains it.
 */
import { openFeatureUpgrade, parseFeatureRefusal } from './feature-upgrade';
import { safeFixPath } from './safe-fix-path';

export { safeFixPath };

/** A backend's "plan limit reached" answer, as the upgrade dialog shows it. */
export interface BridgeQuotaRefusal {
  /** The quota metric the plan ran out of, e.g. `'tickets'`. */
  metric: string;
  /** How much was used when the request was refused, if the backend said. */
  used: number | null;
  /** The plan's cap, if the backend said. */
  limit: number | null;
  /**
   * Where to upgrade, from the refusal's `fix`. Only a same-app path
   * (`/subscription`, `/billing?from=tickets`) is kept: anything else is `null`
   * and the dialog uses `billing.manageRoute` instead.
   */
  fix: string | null;
  /** The backend's own message, if it sent one. */
  message: string | null;
  /** The URL of the request that was refused. */
  url: string;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * The refusal in a 402 body, or null when the body is not a quota refusal
 * (a 402 from a payment provider, a proxy, an old backend).
 */
export function parseQuotaRefusal(body: unknown, url = ''): BridgeQuotaRefusal | null {
  if (typeof body !== 'object' || body === null) return null;
  const b = body as Record<string, unknown>;
  if (b.code !== 'QUOTA_EXCEEDED') return null;
  if (typeof b.metric !== 'string' || b.metric.trim() === '') return null;
  return {
    metric: b.metric,
    used: numberOrNull(b.used),
    limit: numberOrNull(b.limit),
    fix: safeFixPath(b.fix),
    message: typeof b.message === 'string' && b.message.trim() !== '' ? b.message : null,
    url,
  };
}

// ── The latest refusal + listeners (an external store for useSyncExternalStore) ──

type Listener = (refusal: BridgeQuotaRefusal) => void;

const _listeners = new Set<Listener>();
const _watchers = new Set<() => void>();
let _current: BridgeQuotaRefusal | null = null;

/** The refusal the upgrade dialog is showing, or `null`. */
export function getQuotaRefusal(): BridgeQuotaRefusal | null {
  return _current;
}

/** Subscribe to changes of {@link getQuotaRefusal} (the `useSyncExternalStore` shape). */
export function subscribeQuotaRefusal(onChange: () => void): () => void {
  _watchers.add(onChange);
  return () => {
    _watchers.delete(onChange);
  };
}

function changed(): void {
  for (const w of [..._watchers]) w();
}

/** Close the upgrade dialog. */
export function dismissQuotaRefusal(): void {
  if (_current === null) return;
  _current = null;
  changed();
}

/**
 * Run `handler` every time a backend refuses a request because a plan limit is
 * reached — for an app that turned the dialog off (`billing.upgradeDialog:
 * false`) and shows something else, or that logs it. Returns an unsubscribe.
 */
export function onBridgeQuotaExceeded(handler: Listener): () => void {
  _listeners.add(handler);
  return () => {
    _listeners.delete(handler);
  };
}

/** Announce a refusal: the dialog shows it and every listener hears it. */
export function reportQuotaRefusal(refusal: BridgeQuotaRefusal): void {
  _current = refusal;
  changed();
  for (const listener of [..._listeners]) {
    try {
      listener(refusal);
    } catch {
      /* one broken listener must not stop the dialog or the others */
    }
  }
}

// One response may be seen by both bridgeFetch and the page-wide observer
// beneath it; it is announced once.
const _seen = new WeakSet<Response>();

/**
 * Hand a response to the refusal check. Does nothing unless it is a 402; for a
 * 402 it reads a clone of the body in the background and announces it when it
 * is a quota refusal (or, TBP-756, a `402 FEATURE_NOT_IN_PLAN`). Never delays,
 * consumes or changes the response.
 *
 * Returns the background read, for tests; callers never await it.
 */
export function observeQuotaRefusal(response: Response, url = ''): Promise<void> {
  if (!response || response.status !== 402 || _seen.has(response)) return Promise.resolve();
  _seen.add(response);
  let clone: Response;
  try {
    clone = response.clone();
  } catch {
    return Promise.resolve(); // body already used — nothing to read
  }
  return clone
    .json()
    .then((body: unknown) => {
      const refusal = parseQuotaRefusal(body, url || response.url);
      if (refusal) {
        reportQuotaRefusal(refusal);
        return;
      }
      const feature = parseFeatureRefusal(body);
      if (feature) openFeatureUpgrade(feature);
    })
    .catch(() => {
      /* not JSON — not a quota refusal */
    });
}

function originOf(url: string, base?: string): string | null {
  try {
    return new URL(url, base).origin;
  } catch {
    return null;
  }
}

/**
 * Whether the page-wide observer should look at a 402 from `url`: the page's
 * own origin (a route handler, a same-origin `/api` proxy), Bridge's API, or an
 * origin the app listed in `billing.apiOrigins`. A 402 from anywhere else — a
 * payment provider, a third-party API — is not the app's plan limit.
 */
export function watchesQuotaOrigin(
  url: string,
  options: { pageOrigin?: string; apiBaseUrl?: string; apiOrigins?: readonly string[] } = {},
): boolean {
  const target = originOf(url, options.pageOrigin);
  if (!target) return false;
  if (options.pageOrigin && target === originOf(options.pageOrigin)) return true;
  if (options.apiBaseUrl && target === originOf(options.apiBaseUrl)) return true;
  return (options.apiOrigins ?? []).some((o) => originOf(o) === target);
}

/** Test-only: forget listeners and the current refusal. */
export function __resetQuotaRefusalForTests(): void {
  _listeners.clear();
  _current = null;
  changed();
}
